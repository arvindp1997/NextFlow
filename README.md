# NextFlow

A clone of the Galaxy.ai workflow builder, scoped to LLM workflows: Clerk auth, a dashboard of saved workflows, and a React Flow canvas where you wire together Request-Inputs, Crop Image, Gemini 3.1 Pro, and Response nodes, run them (full / multi-select / single-node) as parallel Trigger.dev tasks, and inspect every run in a node-level history panel.

---

## How the App Works

NextFlow lets you build visual AI pipelines — you drag nodes onto a canvas, connect them with typed edges, and run the whole graph (or parts of it) as a real background job. Here is the full picture of how each layer fits together.

### Authentication

Every route is protected by Clerk. Unauthenticated visitors are redirected to the hosted sign-in page (`/sign-in`). After sign-in, Clerk issues a session JWT which the Next.js middleware validates on every request. API routes call `auth()` from `@clerk/nextjs` to get the current `clerkUserId`, and every database query scopes its `WHERE` clause to that user — there is no way for one user to read or modify another user's workflow.

### Dashboard

After signing in, users land on `/dashboard`. This page fetches all workflows owned by the signed-in user from Neon Postgres via Prisma and renders them as cards. From here you can create a new workflow, rename one, duplicate one, delete one, or click through to the workflow overview.

### Workflow Overview (`/workflow/[id]`)

This is the non-technical entry point to a workflow. It has three tabs:

- **Playground** — fill in the workflow's input fields (text or image) and click Run. The panel saves the values, fires the workflow, watches it via a Trigger.dev Realtime subscription (no polling), and shows the output without ever touching the canvas. Run history table below the output shows every past run with node-level expansion — click any run row to see per-node status, inputs, outputs, and errors. Image URL outputs are rendered as actual image previews.
- **API** — placeholder tab for future API-trigger documentation.
- **Workflow** — a read-only preview of the canvas, showing the full node graph exactly as it was built, with no editing capability.

### Canvas Editor (`/workflow/[id]/edit`)

This is where the workflow is actually built. The canvas is powered by `@xyflow/react` (React Flow v12). The global Zustand store (`workflowStore`) is the single source of truth for nodes, edges, selection, run statuses, and undo/redo history. Any change marks the store dirty, and a debounced subscriber auto-saves to Postgres 900ms after the last edit.

**Canvas controls:**

- Drag from the node palette (bottom-center chip) to add Crop Image or Gemini nodes
- Draw edges between typed handles (orange = text, purple = image, green = video, cyan = audio)
- Click an edge to select it, then Delete/Backspace to remove it
- Ctrl+Z / Ctrl+Y for undo/redo
- Ctrl+C / Ctrl+V to duplicate the selected node
- Shift+A or the Wand button in the toolbar to auto-arrange the canvas into a clean DAG layout
- Bottom-center: Duplicate Selected Node button + Add New Node button (Crop Image and Gemini)
- Bottom-left toolbar (collapsible): undo, redo, keyboard shortcuts, zoom, fit-view, auto-arrange, selection mode
- Bottom-right: minimap toggle
- Top-right: Run button, run selected, execution history panel

### Main Execution Flow

This is what happens when you click **Run Workflow**:

```
User clicks Run
    │
    ▼
POST /api/workflows/[id]/run
    │  Validates request (Zod)
    │  Fetches workflow from Postgres
    │  Calls resolveExecutionSet() → determines which nodes to run
    │  tasks.trigger(run-workflow, ..., { publicAccessToken: { expirationTime: "1h" } })
    │  Returns { runId, triggerRunId, publicAccessToken }
    │
    ▼
Trigger.dev: run-workflow task enqueued
    │
    ▼
Orchestrator (src/trigger/runWorkflow.ts)
    │  Builds dependency graph (topological sort)
    │  Runs independent nodes concurrently (Promise per node)
    │  Each node awaits only its direct upstream dependencies
    │  metadata.set("nodeStatuses", {...}) on every node state transition
    │
    ├── request-inputs node   → reads saved field values from data
    ├── crop-image task       → tasks.trigger + runs.subscribeToRun (Realtime, not polling)
    │                           calls Transloadit robot pipeline
    │                           enforces 30s minimum via wait.for({ seconds })
    │                           uploads via wait.createToken/forToken + a notify_url
    │                             webhook (src/app/api/webhooks/transloadit-crop),
    │                             instead of the Transloadit SDK's internal-polling
    │                             waitForCompletion mode
    │                           saves outputImageUrl back to node data
    ├── gemini-generate task  → tasks.trigger + runs.subscribeToRun (Realtime, not polling)
    │                           calls Google Generative AI SDK
    │                           accepts prompt + system prompt + image URLs
    │                           retries up to 4× on 503 (10s→20s→40s→60s backoff)
    │                           aborts immediately on 429 quota errors
    │                           saves response text back to node data
    └── response node         → collects upstream outputs, writes to Run
    │
    ▼
NodeRun records written to Postgres after each node
    │  inputs = actual field values (including image URLs)
    │  output = node result data
    │  error  = full error message if failed
    │
    ▼
Frontend subscribes via useRealtimeRun(triggerRunId, { accessToken: publicAccessToken })
    │  Reads run.metadata.nodeStatuses live → drives the pulsing-glow border
    │    on canvas nodes directly, no DB round-trip in that path
    │  Each genuine status change (deduped against Realtime's own heartbeat
    │    ticks) schedules one debounced fetch of /history — reactive to the
    │    real event, not a fixed interval — so the History/Playground run
    │    list picks up full inputs/outputs/durations shortly after
    │  On run completion: one final /history fetch, subscription closed
    │
    ▼
Run reaches terminal state: SUCCESS / PARTIAL / FAILED / CANCELED
```

### Node Types

| Node               | Purpose                                                                                                       | Inputs                                                                                       | Outputs                                    |
| ------------------ | ------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- | ------------------------------------------ |
| **Request-Inputs** | Entry point — defines the workflow's input fields (text or image upload)                                      | Manual entry / file upload                                                                   | One handle per field (text or image typed) |
| **Crop Image**     | Crops an uploaded image using Transloadit's robot pipeline, with X/Y/Width/Height percent sliders             | Image URL (connected or manual) + 4 percent sliders                                          | `output_image` (image type)                |
| **Gemini**         | Calls Gemini models (3.1 Pro, 2.5 Pro, 2.5 Flash) with prompt, system prompt, and optional image vision input | Prompt (text), System Prompt (text), Image Vision (image, multi-connect), Video, Audio, File | `response` (text type)                     |
| **Response**       | Exit point — collects any number of upstream outputs and displays them as labelled result cards               | Any number of connections (`result` handle, any type)                                        | —                                          |

### Data Flow Between Nodes

Nodes exchange data through typed handles. When an edge connects `CropImage.output_image` → `Gemini.image_vision`, the orchestrator's `resolveNodeInputs()` function looks up the source node's cached output in the in-memory `OutputMap` and passes the image URL directly into the Gemini task's API call. Manual field values are only used when a handle has no incoming connection — a connected handle always takes priority.

---

## Folder Structure

```
nextflow/
├── prisma/
│   └── schema.prisma              # Workflow, Run, NodeRun models
│
├── src/
│   ├── app/                       # Next.js App Router pages + API routes
│   │   ├── api/
│   │   │   ├── upload/
│   │   │   │   └── route.ts       # Transloadit image upload proxy
│   │   │   ├── webhooks/
│   │   │   │   └── transloadit-crop/
│   │   │   │       └── route.ts   # Transloadit notify_url callback — completes the
│   │   │   │                      #   crop-image task's wait.forToken() waitpoint
│   │   │   │                      #   (exempted from Clerk auth in middleware.ts,
│   │   │   │                      #   verified via its own HMAC signature instead)
│   │   │   └── workflows/
│   │   │       ├── route.ts       # GET (list) + POST (create) workflows
│   │   │       └── [id]/
│   │   │           ├── route.ts   # GET + PATCH (save nodes/edges/name) + DELETE
│   │   │           ├── duplicate/
│   │   │           │   └── route.ts  # POST — deep-clone a workflow
│   │   │           ├── history/
│   │   │           │   └── route.ts  # GET — run history with per-node status
│   │   │           └── run/
│   │   │               ├── route.ts  # POST — enqueue a Trigger.dev run
│   │   │               └── [runId]/cancel/
│   │   │                   └── route.ts  # POST — cancel a running job
│   │   ├── dashboard/
│   │   │   └── page.tsx           # Workflow list (server component)
│   │   ├── workflow/[id]/
│   │   │   ├── page.tsx           # Workflow overview (Playground/API/Workflow tabs)
│   │   │   └── edit/
│   │   │       └── page.tsx       # Canvas editor
│   │   ├── sign-in/               # Clerk hosted sign-in
│   │   ├── sign-up/               # Clerk hosted sign-up
│   │   ├── globals.css            # Tailwind base + canvas/React Flow overrides
│   │   └── layout.tsx             # Root layout — ClerkProvider + AttributionLog
│   │
│   ├── components/
│   │   ├── canvas/
│   │   │   ├── WorkflowClient.tsx # Editor page shell — loads store, autosave, run, history
│   │   │   ├── RunRealtimeSync.tsx # Headless Trigger.dev Realtime subscriber (useRealtimeRun),
│   │   │   │                       #   shared by WorkflowClient and PlaygroundPanel so neither
│   │   │   │                       #   polls /history on an interval
│   │   │   ├── WorkflowCanvas.tsx # ReactFlow wrapper — nodeTypes, keyboard shortcuts, toolbars
│   │   │   ├── CanvasToolbar.tsx  # Bottom-left pill — undo/redo/zoom/fit/auto-arrange/selection (collapsible)
│   │   │   ├── AddNodeChip.tsx    # Bottom-center — duplicate button + node picker
│   │   │   ├── NodePicker.tsx     # Popover — add Crop Image or Gemini node
│   │   │   ├── HistoryPanel.tsx   # Right panel — run history, per-node expansion, cancel button
│   │   │   ├── HandleRow.tsx      # Reusable handle + label + field row inside nodes
│   │   │   ├── TypedEdge.tsx      # Custom edge — colour-coded by handle data type
│   │   │   ├── Tooltip.tsx        # Canvas-local tooltip (black bg, hover trigger)
│   │   │   └── nodes/
│   │   │       ├── NodeShell.tsx          # Shared node wrapper — header, run status border glow
│   │   │       ├── RequestInputsNode.tsx  # Entry point node — dynamic field list, image preview with hover-X remove
│   │   │       ├── CropImageNode.tsx      # Image crop node — sliders + preview
│   │   │       ├── GeminiNode.tsx         # AI generation node — model picker, settings
│   │   │       └── ResponseNode.tsx       # Exit node — result cards per connected input
│   │   │
│   │   ├── dashboard/
│   │   │   ├── DashboardClient.tsx    # Dashboard grid + search + create button
│   │   │   ├── WorkflowCard.tsx       # Individual workflow card with actions menu
│   │   │   ├── WorkflowThumbnail.tsx  # Mini canvas preview on each card
│   │   │   ├── Sidebar.tsx            # Left nav — logo, dashboard link, connections link
│   │   │   ├── CreateWorkflowDialog.tsx
│   │   │   ├── RenameDialog.tsx
│   │   │   └── DeleteDialog.tsx
│   │   │
│   │   ├── workflow-overview/
│   │   │   ├── WorkflowOverviewClient.tsx  # Tab shell — Playground / API / Workflow
│   │   │   ├── PlaygroundPanel.tsx         # Input form + Run button + Output + History table with node expansion + Run ID search
│   │   │   └── ReadOnlyWorkflowCanvas.tsx  # Non-interactive canvas preview for Workflow tab
│   │   │
│   │   ├── ui/
│   │   │   ├── Badge.tsx     # Status badge (green/red/yellow/orange/gray tones)
│   │   │   ├── Button.tsx    # Shared button with size/variant props
│   │   │   ├── Dialog.tsx    # Modal dialog wrapper
│   │   │   └── Tooltip.tsx   # Global tooltip component
│   │   │
│   │   └── AttributionLog.tsx   # Logs candidate LinkedIn URL on mount (per assignment spec)
│   │
│   ├── lib/
│   │   ├── types.ts              # All shared types — NodeKind, node data interfaces, handle types
│   │   ├── graph.ts              # Pure DAG logic — resolveExecutionSet, resolveNodeInputs, buildNodeOutput
│   │   ├── validation.ts         # Zod schemas — discriminated union per node kind (not
│   │   │                         #   z.record(z.unknown())) + validateGraphHandles() for
│   │   │                         #   edge/handle-compatibility checks before save
│   │   ├── gemini-client.ts      # Google Generative AI SDK wrapper
│   │   ├── transloadit-upload.ts # Browser-side Transloadit assembly + Socket.IO status
│   │   │                         #   subscription (assembly.websocket_url) instead of polling
│   │   ├── sample-workflow.ts    # "Load Sample Workflow" — pre-built 7-node product pipeline
│   │   ├── auth.ts               # requireAuth() helper — throws if unauthenticated
│   │   ├── prisma.ts             # Singleton Prisma client
│   │   └── utils.ts              # cn(), uid(), formatRelativeTime()
│   │
│   ├── store/
│   │   ├── workflowStore.ts      # Zustand store — nodes, edges, history, selection, run statuses, auto-arrange
│   │   └── runRequestStore.ts    # Tiny store for per-node Run button → WorkflowClient bridge
│   │
│   ├── trigger/
│   │   ├── runWorkflow.ts        # Root orchestrator task — DAG fan-out, NodeRun writes, finalize.
│   │   │                         #   Waits on child task runs via runs.subscribeToRun (Realtime),
│   │   │                         #   not a runs.retrieve() polling loop, and publishes live
│   │   │                         #   per-node status via metadata.set("nodeStatuses", …)
│   │   ├── cropImage.ts          # Transloadit crop sub-task. 30s minimum via wait.for({ seconds }),
│   │   │                         #   not setTimeout. Transloadit upload uses wait.createToken() +
│   │   │                         #   a notify_url webhook + wait.forToken() instead of the
│   │   │                         #   Transloadit SDK's internal-polling waitForCompletion mode
│   │   └── gemini.ts             # Gemini API sub-task — prompt + vision + settings + retry logic
│   │
│   └── middleware.ts             # Clerk auth middleware — protects all routes except
│                                  #   sign-in/sign-up/api/webhooks (incoming third-party
│                                  #   callbacks like Transloadit's notify_url have no Clerk
│                                  #   session; they authenticate via their own signature)
│
├── trigger.config.ts             # Trigger.dev project config + build settings
├── next.config.js                # Next.js config — serverExternalPackages for ffmpeg/prisma
├── tailwind.config.ts
└── tsconfig.json
```

---

## Status

Verified to compile cleanly (`npx tsc --noEmit`, `npx next lint`, full `next build`) and run end-to-end in production on Vercel — including a full run through the required sample workflow (Request-Inputs → 2× Crop Image → Gemini chain → Response) with the Trigger.dev Realtime subscription, `wait.for`/`wait.forToken` crop flow, and the Transloadit `notify_url` webhook all confirmed working against real deployed infrastructure, not just local dev. The only sandbox limitation during development was `prisma generate` (no network access to `binaries.prisma.sh`) — this works normally on any machine with internet access.

---

## 1. Install

```bash
npm install
```

## 2. Get your API keys

Create `.env` from the template and fill in each value as you get it:

```bash
cp .env.example .env
```

**Clerk** (auth) — [clerk.com](https://clerk.com) → create an application → API Keys page → copy the publishable key and secret key into `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` / `CLERK_SECRET_KEY`. In the Clerk dashboard, also disable any sign-up restrictions you don't want, since this app has no marketing page — Clerk's own hosted components are the only public surface.

**Neon Postgres** (database) — [neon.tech](https://neon.tech) → create a project → copy the **pooled** connection string (not the direct connection string) into `DATABASE_URL`. The pooled endpoint handles Neon's auto-suspend/wake transparently; the direct connection string will time out when the database is cold.

**Trigger.dev** (job execution) — [trigger.dev](https://trigger.dev) → create a project → Project Settings for the project ref (`TRIGGER_PROJECT_ID`, also paste it into `trigger.config.ts`'s `project` field) and an API key (`TRIGGER_SECRET_KEY`).

**Google AI Studio / Gemini** — [aistudio.google.com](https://aistudio.google.com) → Get API Key → paste into `GOOGLE_GENERATIVE_AI_API_KEY`. Note: the assignment doc names the `@google/generative-ai` package, but that package has had no updates in over a year; this app uses Google's current actively-maintained `@google/genai` SDK instead, which is the supported path for current Gemini models. The free tier allows 20 requests/day per model — enable billing if you need higher limits.

**Transloadit** (image upload + crop storage) — [transloadit.com](https://transloadit.com) → create an account → go to the **Credentials** page and copy the real Auth Key + Auth Secret (long generated strings, not anything you make up yourself) into `TRANSLOADIT_AUTH_KEY` / `TRANSLOADIT_AUTH_SECRET`. No Template and no robot/storage configuration is needed — uploads read the file's auto-generated temporary URL straight from the assembly response (see "Known limitations" below for the tradeoff this implies).

**`NEXT_PUBLIC_APP_URL`** — the app's own public base URL, used to build the Transloadit `notify_url` webhook callback the `crop-image` task waits on. Locally, this needs a public tunnel (see "Testing the crop-image webhook locally" under Deploy) since `crop-image` runs on Trigger.dev's cloud infrastructure, not your machine — `http://localhost:3000` is not reachable from there. In production, set it to your real deployed domain. **This must be set in the Trigger.dev dashboard's environment variables in addition to wherever else you set env vars** (`.env` locally, Vercel in production) — see "Review feedback addressed" above for why.

## 3. Set up the database

```bash
npx prisma generate
npx prisma migrate dev --name init
```

## 4. Run it

You need two processes running side by side:

```bash
npm run dev           # Next.js app on localhost:3000
npm run trigger:dev   # Trigger.dev dev worker — required for any node to actually execute
```

Without the second process running, "Run Workflow" will start a run that never completes, since nothing is listening for the `crop-image`, `gemini-generate`, or `run-workflow` tasks.

## 5. Deploy

Pushing to GitHub and letting Vercel auto-deploy only covers the Next.js half of this app. The Trigger.dev task code (`crop-image`, `gemini-generate`, `run-workflow`) lives in a separate deployment target entirely. Checklist:

- **Deploy the Trigger.dev project separately**: `npx trigger.dev@latest deploy`. **Required every time you change anything under `src/trigger/`** — a `git push` alone does not update the deployed task code, and an old deployed version will silently keep running against your production app.
- **`TRIGGER_SECRET_KEY` in Vercel must be the Production key**, not the Development one — each Trigger.dev environment has its own. Get it from the Trigger.dev dashboard.
- **`NEXT_PUBLIC_APP_URL` must be set in both places** (see "Review feedback addressed" above): Vercel's env vars, and the Trigger.dev dashboard's environment variables for Production. Set it to your real deployed URL (e.g. `https://your-app.vercel.app` or a custom domain) — no trailing slash.
- **Environment variables the Trigger.dev-side task code reads** (`TRANSLOADIT_AUTH_KEY`, `TRANSLOADIT_AUTH_SECRET`, `DATABASE_URL`, `GOOGLE_GENERATIVE_AI_API_KEY`, `NEXT_PUBLIC_APP_URL`) must be set in the **Trigger.dev dashboard's Environment Variables page**, tagged for the environment you deployed to. Note the dashboard's own tooltip on this: for the **Development** environment specifically, a local `.env` file overrides whatever's set there when running `trigger dev` locally — but that override does not apply to a `trigger deploy`'d Production environment, which only ever reads what's configured in the dashboard.
- **Clerk production keys** — if you were developing against a Clerk dev instance, swap `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`/`CLERK_SECRET_KEY` for your production instance's keys in Vercel; dev keys are domain-restricted and won't authenticate on a real deployed domain.
- Make sure `binaryTargets` in `prisma/schema.prisma` includes `"debian-openssl-3.0.x"` alongside `"native"` — Trigger.dev's cloud workers run on Linux and need the correct Prisma query engine binary. Without this, the worker will fail at runtime with a "query engine not found" error even though it compiles fine locally.
- Confirm `DATABASE_URL` (Neon/Supabase/etc.) is reachable from both Vercel's functions and Trigger.dev's cloud workers — generally true by default for a managed Postgres provider, just worth confirming if yours has IP allowlisting enabled.

### Testing the crop-image webhook locally before deploying

`crop-image`'s Transloadit upload waits on a `notify_url` webhook callback (see above), which means Transloadit's servers need a real public URL to call back to — `localhost:3000` doesn't work even though the task itself runs fine locally via `trigger dev`. To test this flow before deploying:

1. Start a tunnel: `ngrok http 3000` (or Cloudflare Tunnel, or Transloadit's own `npx -y @transloadit/notify-url-relay`).
2. Set `NEXT_PUBLIC_APP_URL` in your local `.env` to the tunnel's `https://` URL.
3. Restart both `npm run dev` and `npx trigger.dev@latest dev` so they pick up the change.
4. Use the app via that tunnel URL (not `localhost:3000`) for any run that includes a Crop Image node.
5. If it hangs, check (in order): the Trigger.dev run's logs for the assembly ID → look it up directly at `https://api2.transloadit.com/assemblies/<id>` to see if Transloadit ever tried the callback → the tunnel's own request inspector (ngrok: `http://127.0.0.1:4040`) to see whether the callback reached your app and what it returned.
6. **Free ngrok domains show a `404`, not a warning page, if the request never reaches your route at all** — that's usually Clerk middleware rejecting the unauthenticated webhook request (see `middleware.ts`'s `/api/webhooks(.*)` exemption above), not ngrok itself.

---

## Review feedback addressed

A prior codebase review flagged four issues as the main gaps against the assignment spec. Here's what changed for each, and where:

**1. No Trigger Realtime.**
Added `useRealtimeRun` (`@trigger.dev/react-hooks`) on the frontend — `src/components/canvas/RunRealtimeSync.tsx`, shared by the canvas editor and the Playground tab — subscribed with a scoped `publicAccessToken` minted per run (`POST /run`) and re-minted on page reload for any run still in flight (`GET /history`). The orchestrator publishes live per-node status via `metadata.set("nodeStatuses", …)` (`src/trigger/runWorkflow.ts`) — genuine Trigger-metadata-driven realtime updates, not a derived/simulated status.

**2. Polling used heavily.**

- Workflow history/status refresh (canvas editor **and** the Playground tab, which had its own separate polling loop) — replaced with the Realtime subscription above plus a debounced (not interval-based) fetch triggered only by an actual status change.
- Trigger child-task tracking (`runs.retrieve()` in a loop) — replaced with `runs.subscribeToRun()`, a Realtime async iterator. (Deliberately not `triggerAndWait`: Trigger.dev disallows wrapping that in `Promise.all`, which is how this orchestrator gets its parallel DAG fan-out — `subscribeToRun` has no such restriction.)
- Transloadit upload/status flow (browser-side) — switched to a Socket.IO subscription on the assembly's `websocket_url` (`src/lib/transloadit-upload.ts`).
- Crop upload's `waitForCompletion: true` (internal SDK polling) — replaced with `wait.createToken()` + a `notify_url` webhook (`src/app/api/webhooks/transloadit-crop`) + `wait.forToken()` — a genuine Trigger wait pattern, zero polling.

**3. Crop delay used `setTimeout`.**
Now `wait.for({ seconds })` (`src/trigger/cropImage.ts`) — the run is actually checkpointed for the duration rather than holding a `setTimeout` on a hot worker.

**4. Server-side validation could be stricter.**
`data: z.record(z.unknown())` replaced with a discriminated union validating each node kind's actual shape, plus a new `validateGraphHandles()` check that rejects edges referencing a nonexistent handle or connecting incompatible data types — wired into both the save (`PATCH /api/workflows/[id]`) and create/import (`POST /api/workflows`) routes (`src/lib/validation.ts`).

Two things worth knowing if you're evaluating this against a fresh clone:

- **`NEXT_PUBLIC_APP_URL` must be set in _two_ places**, not just one: Vercel's env vars (for the Next.js app itself) _and_ the Trigger.dev dashboard's environment variables for whichever environment you're running against (Development or Production) — the `crop-image` task runs on Trigger.dev's infrastructure, not Vercel's, and needs its own copy to build the webhook callback URL. Missing this surfaces as the task hanging indefinitely at `wait.forToken()`.
- **Local dev testing of the crop-image webhook requires a public tunnel** (ngrok, Cloudflare Tunnel, or Transloadit's own `@transloadit/notify-url-relay`) pointed at `localhost:3000`, since Transloadit's servers need to reach `notify_url` from the public internet. See "Deploy" below for the same requirement in production (where it's just your real domain, no tunnel needed).

---

## The required sample workflow

The spec requires the exact product-description pipeline from its Nodes/Edges table to ship pre-built. Rather than a static seed script tied to one Clerk user id (which can't be known ahead of time), click **Load Sample Workflow** on the dashboard — it creates that exact 7-node graph (Request-Inputs → 2x Crop Image + Gemini #1 → Gemini #2 → Final Gemini → Response, with the system prompts and crop percentages from the spec) for whichever account is signed in. Upload a product photo into the `image_field` after loading it, then Run Workflow.

---

## Architecture notes

- **Auth**: `middleware.ts` protects every route except `/sign-in` and `/sign-up`; unauthenticated visitors are redirected straight to Clerk, with no marketing/landing page, per spec.
- **Data model**: `prisma/schema.prisma` — a `Workflow` stores its full React Flow graph as JSON (`nodes`/`edges`), so the canvas can rehydrate exactly what was saved with no transform. `Run`/`NodeRun` persist execution history independently, so history survives later edits to the live graph.
- **DAG execution**: `src/lib/graph.ts` has the pure dependency-resolution and input-resolution logic (connection overrides manual entry, multi-connection handles like Image (Vision) collect into an array). `src/trigger/runWorkflow.ts` is the orchestrator task: it gives every node in the execution set its own promise that awaits only its direct upstream dependencies, so independent siblings fire concurrently at T=0 and a finished node fans out to its dependents immediately, without blocking on unrelated nodes at the same DAG level — this is what the spec's "parallel execution" and "selective execution" requirements come down to.
- **Single-node / multi-select runs**: per spec, these execute _only_ the targeted nodes, not their upstream dependencies. The orchestrator seeds its in-memory outputs map from every node's last-known persisted output (`getCachedNodeOutput`) so a node being re-run still resolves its connected inputs correctly even though its upstream wasn't re-executed.
- **Gemini retry**: the `gemini-generate` Trigger.dev task retries up to 4 times with exponential backoff (10s → 20s → 40s → 60s) on transient 503 errors. 429 quota-exhausted errors use `AbortTaskRunError` to skip retries immediately — retrying a daily quota limit is pointless and wastes attempts.
- **The 30s Crop Image delay** is enforced inside the task itself (`src/trigger/cropImage.ts`), measured from task start, regardless of how fast FFmpeg actually finishes.
- **Edge deletion**: selected edges are tracked in the Zustand store (`selectedEdgeIds`) and deleted by the same Delete/Backspace handler that removes nodes. Click an edge to select it (it highlights), then press Delete.
- **History panel node expansion**: every node row in the history panel (both the canvas editor's side panel and the Playground tab's run history table) is expandable. Clicking a row reveals the node's inputs, output, and error message. Image URL values are rendered as actual image previews rather than raw URL strings.
- **Auto-arrange**: the Wand button (or Shift+A) lays out nodes into a clean left-to-right DAG using a topological sort. Column positions and row heights are calculated from each node's actual measured dimensions (via `node.measured`) so nodes never overlap regardless of their content height.
- **Live UI updates**: `WorkflowClient.tsx` (canvas editor) and `PlaygroundPanel.tsx` (Workflow Overview's Playground tab) both use `RunRealtimeSync.tsx` — a shared headless component wrapping Trigger.dev's `useRealtimeRun` — to subscribe to the in-progress run. Per-node status comes from `run.metadata.nodeStatuses` (set by the orchestrator via `metadata.set()`) and drives the pulsing-glow border directly, with no request in that path at all. Each genuine status change (deduped against Realtime's own heartbeat ticks, which fire far more often than the data actually changes) schedules one debounced fetch of `/history` for the fuller Postgres-backed record (durations, full inputs/outputs) — reactive to the real event, not a fixed interval. There is no `setInterval` polling anywhere in this app.
- **Build attribution console.log**: the assignment doc requires logging a candidate LinkedIn URL on every page load. This is implemented in `src/components/AttributionLog.tsx`, reading from `NEXT_PUBLIC_CANDIDATE_LINKEDIN_URL` so nothing is hardcoded — leave that env var blank to log nothing, or delete the component entirely if you'd rather not include it.

---

## What could be improved

These are real gaps that are worth fixing in a production version. They are documented here rather than silently left out.

### Toast notifications

There is no feedback when a run starts, succeeds, fails, or is canceled — the user has to watch the canvas border colours or open the History panel to know what happened.

**The fix:** Add a lightweight toast library (`sonner` is a good fit — minimal, unstyled by default, works cleanly with Tailwind) and fire toasts from the `onSettled` callback passed to `RunRealtimeSync` in `WorkflowClient.tsx`/`PlaygroundPanel.tsx`: `toast.success("Run completed")` when the latest run transitions to SUCCESS, `toast.error("Run failed — check history for details")` on FAILED/PARTIAL, and `toast.info("Run canceled")` on CANCELED. This is a small change with a large UX impact.

### Streaming Gemini output

Currently the Gemini node only shows its response after the full generation completes. For long outputs this means a blank node for 10-30 seconds with no indication of progress.

**The fix:** Google's `@google/genai` SDK supports streaming via `generateContentStream()`. The Trigger.dev task could write partial response chunks to the node's data incrementally (e.g. via `metadata.set()`, the same Realtime channel node statuses already use), and the frontend's existing `useRealtimeRun` subscription would pick them up progressively with no extra plumbing. This is a meaningful UX improvement for any workflow producing substantial text output.

### DAG cycle validation on the canvas

Currently, drawing an edge that would create a cycle in the graph is only caught at save time (the `PATCH /api/workflows/[id]` route validates and rejects it). The canvas itself doesn't prevent you from making the connection — you only find out it was invalid when the auto-save fires and silently fails.

**The fix:** In `WorkflowCanvas.tsx`'s `onConnect` handler, run a lightweight cycle-detection check (DFS from the proposed target node back to the proposed source node using the current edge list) before calling `addEdge`. If a cycle would be created, reject the connection and show a toast explaining why.

### Persistent Transloadit image URLs

Transloadit's temporary assembly URLs expire after a short window (typically a few hours to a few days depending on account tier). A workflow that was built and saved yesterday may have broken image previews today because the `inputImageUrl` stored in the node data points to an expired Transloadit URL.

**The fix:** Add an S3 (or Cloudflare R2) export step to the Transloadit assembly using the `/s3/store` robot. The permanent S3 URL should be stored instead of the temporary assembly URL. This requires adding S3 credentials to the environment and configuring the Transloadit template, but is the correct production approach.

### Response node label editing

The Response node supports custom display labels for each connected result (stored in `data.resultLabels` keyed by edge id) but there is no UI to edit them — the label always falls back to the auto-derived `slugifyLabel(nodeDisplayLabel(...))` value.

**The fix:** In `ResponseNode.tsx`, make each result card's label an inline-editable input (similar to how node labels work elsewhere), and call `updateNodeData` to persist the label into `resultLabels[edgeId]`.

---

## Known limitations / what to check first

- **`fluent-ffmpeg` doesn't bundle the actual `ffmpeg`/`ffprobe` binaries** — it just shells out to whatever's on your system PATH, which gave a "Cannot find ffprobe" failure on a clean machine (especially common on Windows). Fixed by using `@ffmpeg-installer/ffmpeg` and `@ffprobe-installer/ffprobe`, which bundle static per-platform binaries — `ffmpeg.setFfmpegPath()`/`setFfprobePath()` now point at those instead of assuming a system install. One thing to verify on deploying: Trigger.dev's cloud build step may need its bundler configured to keep these binary files external rather than tree-shaken away.
- **Uploads use Transloadit's automatic temporary URLs, not permanent storage.** The actual fix required a single `":original"` step using the `/upload/handle` robot — removing the robot entirely triggers `ASSEMBLY_NO_STEPS`, and the `/file/store` robot doesn't exist (real storage robots like `/s3/store` need external credentials). The file's temporary `ssl_url` appears under either `results[":original"]` or the top-level `uploads` array depending on account/region — both locations are checked. Browser-side upload status uses a Socket.IO subscription to the assembly's own `websocket_url` (`src/lib/transloadit-upload.ts`), not polling.
- **A run getting stuck in "Running" forever with a failed node was a real bug — fixed.** The orchestrator originally used thrown errors to mark nodes FAILED, but those exceptions propagated through `Promise.all` and crashed the task before it could mark the Run as finished. Node failures are now tracked in an explicit outcome map; downstream nodes whose upstream failed are recorded as SKIPPED; the run always reaches a terminal state (SUCCESS / PARTIAL / FAILED) regardless of individual node failures. A Cancel button in the history panel provides a manual safety valve.
- **`NEXT_PUBLIC_APP_URL` needing to be set in two separate places (Vercel + Trigger.dev dashboard) is an easy thing to miss and surfaces confusingly** — the symptom is `crop-image` hanging indefinitely at `wait.forToken()` with no obvious error, since the task itself starts and runs fine; it's only the Transloadit callback that silently never arrives. See "Review feedback addressed" and "Deploy" above.
- **Video/Audio/File inputs on the Gemini node** are visually present with correctly-typed handles for connections, but have no manual upload control wired up (only Prompt, System Prompt, and Image (Vision) support both connection and manual entry/upload). The required sample workflow only exercises Prompt and Image (Vision), so this doesn't block the core deliverable.
- **DAG cycle validation** runs on save (`PATCH /api/workflows/[id]`) but the canvas doesn't yet visually reject an in-progress drag that would create a cycle — it'll save-reject instead of connection-reject.
- **Pixel-matching the Galaxy.ai reference** was done from the written spec and the one reference screenshot in the assignment doc, not a live side-by-side against `try.galaxy.ai/clone`. Expect to need a visual pass once you can compare directly.
- **Prisma major version**: pinned to 5.x here since that's what was verified; Prisma 6/7 are available if you'd rather be on the latest.
