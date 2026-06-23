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

- **Playground** — fill in the workflow's input fields (text or image) and click Run. The panel saves the values, fires the workflow, polls for completion, and shows the output without ever touching the canvas.
- **API** — placeholder tab for future API-trigger documentation.
- **Workflow** — a read-only preview of the canvas, showing the full node graph exactly as it was built, with no editing capability.

### Canvas Editor (`/workflow/[id]/edit`)

This is where the workflow is actually built. The canvas is powered by `@xyflow/react` (React Flow v12). The global Zustand store (`workflowStore`) is the single source of truth for nodes, edges, selection, run statuses, and undo/redo history. Any change marks the store dirty, and a debounced subscriber auto-saves to Postgres 900ms after the last edit.

**Canvas controls:**

- Drag from the node palette (bottom-center chip) to add Crop Image or Gemini nodes
- Draw edges between typed handles (orange = text, purple = image, green = video, cyan = audio)
- Ctrl+Z / Ctrl+Y for undo/redo
- Delete / Backspace to remove selected nodes or edges
- Bottom-center: Duplicate Selected Node Btn to duplicate a node, Add New Node Btn (Crop Image and Gemini)
- Bottom-left toolbar: undo, redo, keyboard shortcuts, zoom, fit-view, selection mode
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
    │
    ▼
Trigger.dev: run-workflow task enqueued
    │
    ▼
Orchestrator (src/trigger/runWorkflow.ts)
    │  Builds dependency graph (topological sort)
    │  Runs independent nodes concurrently (Promise per node)
    │  Each node awaits only its direct upstream dependencies
    │
    ├── request-inputs node   → reads saved field values from data
    ├── crop-image task       → calls Transloadit robot pipeline
    │                           enforces 30s minimum duration
    │                           saves outputImageUrl back to node data
    ├── gemini-generate task  → calls Google Generative AI SDK
    │                           accepts prompt + system prompt + image URLs
    │                           saves response text back to node data
    └── response node         → collects upstream outputs, writes to Run
    │
    ▼
NodeRun records written to Postgres after each node
    │
    ▼
Frontend polls GET /api/workflows/[id]/history every 2s
    │  Applies per-node run statuses → pulsing border on canvas nodes
    │  Applies node outputs → results visible inside each node
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
│   │   │   ├── WorkflowCanvas.tsx # ReactFlow wrapper — nodeTypes, keyboard shortcuts, toolbars
│   │   │   ├── CanvasToolbar.tsx  # Bottom-left pill — undo/redo/zoom/fit/selection (collapsible)
│   │   │   ├── AddNodeChip.tsx    # Bottom-center — duplicate button + node picker
│   │   │   ├── NodePicker.tsx     # Popover — add Crop Image or Gemini node
│   │   │   ├── HistoryPanel.tsx   # Right panel — run history, per-node status, cancel button
│   │   │   ├── HandleRow.tsx      # Reusable handle + label + field row inside nodes
│   │   │   ├── TypedEdge.tsx      # Custom edge — colour-coded by handle data type
│   │   │   ├── Tooltip.tsx        # Canvas-local tooltip (black bg, hover trigger)
│   │   │   └── nodes/
│   │   │       ├── NodeShell.tsx          # Shared node wrapper — header, run status border glow
│   │   │       ├── RequestInputsNode.tsx  # Entry point node — dynamic field list
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
│   │   │   ├── PlaygroundPanel.tsx         # Input form + Run button + Output + History table
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
│   │   ├── validation.ts         # Zod schemas for API route input validation
│   │   ├── gemini-client.ts      # Google Generative AI SDK wrapper
│   │   ├── transloadit-upload.ts # Browser-side Transloadit assembly + polling
│   │   ├── sample-workflow.ts    # "Load Sample Workflow" — pre-built 7-node product pipeline
│   │   ├── auth.ts               # requireAuth() helper — throws if unauthenticated
│   │   ├── prisma.ts             # Singleton Prisma client
│   │   └── utils.ts              # cn(), uid(), formatRelativeTime()
│   │
│   ├── store/
│   │   ├── workflowStore.ts      # Zustand store — nodes, edges, history, selection, run statuses
│   │   └── runRequestStore.ts    # Tiny store for per-node Run button → WorkflowClient bridge
│   │
│   ├── trigger/
│   │   ├── runWorkflow.ts        # Root orchestrator task — DAG fan-out, NodeRun writes, finalize
│   │   ├── cropImage.ts          # Transloadit crop sub-task (30s enforced minimum)
│   │   └── gemini.ts             # Gemini API sub-task — prompt + vision + settings
│   │
│   └── middleware.ts             # Clerk auth middleware — protects all routes except sign-in/sign-up
│
├── trigger.config.ts             # Trigger.dev project config + build settings
├── next.config.js                # Next.js config — serverExternalPackages for ffmpeg/prisma
├── tailwind.config.ts
└── tsconfig.json
```

---

## Status

This was scaffolded end-to-end and verified to compile cleanly: `npx tsc --noEmit`, `npx next lint`, and a full `next build` all pass (webpack compile + type check succeed; the only failure in this sandbox is `prisma generate` itself, because this environment can't reach `binaries.prisma.sh` — that step will work normally on your machine with internet access). It has **not** been run against live Clerk/Trigger.dev/Transloadit/Gemini/Postgres, since none of those services are reachable from the sandbox this was built in. Budget time to wire up real keys and shake out integration bugs — see "Known limitations" below for the spots most likely to need attention.

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

**Neon Postgres** (database) — [neon.tech](https://neon.tech) → create a project → copy the pooled connection string into `DATABASE_URL`.

**Trigger.dev** (job execution) — [trigger.dev](https://trigger.dev) → create a project → Project Settings for the project ref (`TRIGGER_PROJECT_ID`, also paste it into `trigger.config.ts`'s `project` field) and an API key (`TRIGGER_SECRET_KEY`).

**Google AI Studio / Gemini** — [aistudio.google.com](https://aistudio.google.com) → Get API Key → paste into `GOOGLE_GENERATIVE_AI_API_KEY`. Note: the assignment doc names the `@google/generative-ai` package, but that package has had no updates in over a year; this app uses Google's current actively-maintained `@google/genai` SDK instead, which is the supported path for current Gemini models.

**Transloadit** (image upload + crop storage) — [transloadit.com](https://transloadit.com) → create an account → go to the **Credentials** page and copy the real Auth Key + Auth Secret (long generated strings, not anything you make up yourself) into `TRANSLOADIT_AUTH_KEY` / `TRANSLOADIT_AUTH_SECRET`. No Template and no robot/storage configuration is needed — uploads read the file's auto-generated temporary URL straight from the assembly response (see "Known limitations" below for the tradeoff this implies).

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

- Push to GitHub, import into Vercel, add all the same env vars there.
- Deploy your Trigger.dev project separately (`npx trigger.dev@latest deploy`) and point `TRIGGER_SECRET_KEY`/`TRIGGER_PROJECT_ID` at the deployed environment, not the dev one.
- Make sure `binaryTargets` in `prisma/schema.prisma` includes `"debian-openssl-3.0.x"` alongside `"native"` — Trigger.dev's cloud workers run on Linux and need the correct Prisma query engine binary. Without this, the worker will fail at runtime with a "query engine not found" error even though it compiles fine locally.

---

## The required sample workflow

The spec requires the exact product-description pipeline from its Nodes/Edges table to ship pre-built. Rather than a static seed script tied to one Clerk user id (which can't be known ahead of time), click **Load Sample Workflow** on the dashboard — it creates that exact 7-node graph (Request-Inputs → 2x Crop Image + Gemini #1 → Gemini #2 → Final Gemini → Response, with the system prompts and crop percentages from the spec) for whichever account is signed in. Upload a product photo into the `image_field` after loading it, then Run Workflow.

---

## Architecture notes

- **Auth**: `middleware.ts` protects every route except `/sign-in` and `/sign-up`; unauthenticated visitors are redirected straight to Clerk, with no marketing/landing page, per spec.
- **Data model**: `prisma/schema.prisma` — a `Workflow` stores its full React Flow graph as JSON (`nodes`/`edges`), so the canvas can rehydrate exactly what was saved with no transform. `Run`/`NodeRun` persist execution history independently, so history survives later edits to the live graph.
- **DAG execution**: `src/lib/graph.ts` has the pure dependency-resolution and input-resolution logic (connection overrides manual entry, multi-connection handles like Image (Vision) collect into an array). `src/trigger/runWorkflow.ts` is the orchestrator task: it gives every node in the execution set its own promise that awaits only its direct upstream dependencies, so independent siblings fire concurrently at T=0 and a finished node fans out to its dependents immediately, without blocking on unrelated nodes at the same DAG level — this is what the spec's "parallel execution" and "selective execution" requirements come down to.
- **Single-node / multi-select runs**: per spec, these execute _only_ the targeted nodes, not their upstream dependencies. The orchestrator seeds its in-memory outputs map from every node's last-known persisted output (`getCachedNodeOutput`) so a node being re-run still resolves its connected inputs correctly even though its upstream wasn't re-executed.
- **The 30s Crop Image delay** is enforced inside the task itself (`src/trigger/cropImage.ts`), measured from task start, regardless of how fast FFmpeg actually finishes.
- **Live UI updates**: `WorkflowClient.tsx` polls `/api/workflows/[id]/history` every 2s, applying the latest run's per-node statuses (drives the pulsing-glow border in `NodeShell`) and outputs back onto the canvas nodes.
- **Build attribution console.log**: the assignment doc requires logging a candidate LinkedIn URL on every page load. This is implemented in `src/components/AttributionLog.tsx`, reading from `NEXT_PUBLIC_CANDIDATE_LINKEDIN_URL` so nothing is hardcoded — leave that env var blank to log nothing, or delete the component entirely if you'd rather not include it.

---

## What could be improved

These are real gaps that are worth fixing in a production version. They are documented here rather than silently left out.

### Error visibility for failed nodes

Currently when a node fails, the canvas shows a red pulsing border and the History panel shows "Failed" — but the actual error message (e.g. `ApiError: 503 UNAVAILABLE — model overloaded`, or `Transloadit: ASSEMBLY_NO_STEPS`) is stored in the `NodeRun.error` column in Postgres and fetched as part of the history response, but not surfaced in the UI anywhere the user can read it.

**The fix:** In `HistoryPanel.tsx`, when a node row is expanded, render `nodeRun.error` if it exists — a simple pre-wrapped red text block under the node's status row would be enough. The data is already there in the API response; it just needs to be displayed. Same applies to `NodeShell.tsx` — the `error` field exists on `CropImageNodeData` and `GeminiNodeData` and gets written by the orchestrator, but no node component currently renders it.

### Toast notifications

There is no feedback when a run starts, succeeds, fails, or is canceled — the user has to watch the canvas border colours or open the History panel to know what happened.

**The fix:** Add a lightweight toast library (`sonner` is a good fit — minimal, unstyled by default, works cleanly with Tailwind) and fire toasts from `WorkflowClient.tsx`'s polling loop: `toast.success("Run completed")` when the latest run transitions to SUCCESS, `toast.error("Run failed — check history for details")` on FAILED/PARTIAL, and `toast.info("Run canceled")` on CANCELED. This is a small change with a large UX impact.

### Automatic retry on Gemini 503

The Gemini API occasionally returns `503 UNAVAILABLE` (model temporarily overloaded) under high demand. Currently this fails the node and the run immediately with no retry.

**The fix:** Trigger.dev supports per-task retry configuration natively. In `src/trigger/gemini.ts`, add:

```ts
export const geminiGenerateTask = task({
  id: "gemini-generate",
  retry: { maxAttempts: 3, minTimeoutInMs: 2000, factor: 2 },
  run: async (payload) => { ... }
});
```

This gives the Gemini task up to 3 attempts with exponential backoff before marking it failed — enough to ride out most transient 503 spikes without any user intervention.

### Streaming Gemini output

Currently the Gemini node only shows its response after the full generation completes. For long outputs this means a blank node for 10-30 seconds with no indication of progress.

**The fix:** Google's `@google/genai` SDK supports streaming via `generateContentStream()`. The Trigger.dev task could write partial response chunks to the node's data incrementally, and the frontend's 2-second poll would pick them up progressively. This is a meaningful UX improvement for any workflow producing substantial text output.

### DAG cycle validation on the canvas

Currently, drawing an edge that would create a cycle in the graph is only caught at save time (the `PATCH /api/workflows/[id]` route validates and rejects it). The canvas itself doesn't prevent you from making the connection — you only find out it was invalid when the auto-save fires and silently fails.

**The fix:** In `WorkflowCanvas.tsx`'s `onConnect` handler, run a lightweight cycle-detection check (DFS from the proposed target node back to the proposed source node using the current edge list) before calling `addEdge`. If a cycle would be created, reject the connection and optionally show a toast explaining why.

### Persistent Transloadit image URLs

Transloadit's temporary assembly URLs expire after a short window (typically a few hours to a few days depending on account tier). A workflow that was built and saved yesterday may have broken image previews today because the `inputImageUrl` stored in the node data points to an expired Transloadit URL.

**The fix:** Add an S3 (or Cloudflare R2) export step to the Transloadit assembly using the `/s3/store` robot. The permanent S3 URL should be stored instead of the temporary assembly URL. This requires adding S3 credentials to the environment and configuring the Transloadit template, but is the correct production approach.

### WebSocket / SSE for live run status

The frontend currently polls `/api/workflows/[id]/history` every 2 seconds to get run status updates. This works, but it means status can lag up to 2 seconds behind reality and generates constant unnecessary requests when no run is in progress.

**The fix:** Trigger.dev exposes a Realtime API (`@trigger.dev/sdk/react` provides `useRealtimeRun`) that pushes run status updates over a subscription rather than polling. Switching to this would give instant status updates on the canvas and eliminate the polling entirely.

### Response node label editing

The Response node supports custom display labels for each connected result (stored in `data.resultLabels` keyed by edge id) but there is no UI to edit them — the label always falls back to the auto-derived `slugifyLabel(nodeDisplayLabel(...))` value.

**The fix:** In `ResponseNode.tsx`, make each result card's label an inline-editable input (similar to how node labels work elsewhere), and call `updateNodeData` to persist the label into `resultLabels[edgeId]`.

---

## Known limitations / what to check first

- **`fluent-ffmpeg` doesn't bundle the actual `ffmpeg`/`ffprobe` binaries** — it just shells out to whatever's on your system PATH, which gave a "Cannot find ffprobe" failure on a clean machine (especially common on Windows, where PATH setup for CLI tools is its own adventure). Fixed by using `@ffmpeg-installer/ffmpeg` and `@ffprobe-installer/ffprobe`, which bundle static per-platform binaries and resolve automatically via npm's OS-conditional optional dependencies — `ffmpeg.setFfmpegPath()`/`setFfprobePath()` now point at those instead of assuming a system install. Run `npm install` again to pull these down. One thing to verify once you get to deploying (not just local dev): Trigger.dev's cloud build step may need its bundler configured to keep these binary files external/copied rather than tree-shaken away, since they're real executables on disk, not just JS — worth a test deploy run before relying on it in production.
- **Uploads use Transloadit's automatic temporary URLs, not permanent storage — and getting there took a couple of wrong turns worth knowing about.** First, an earlier version referenced a robot called `/file/store`, which doesn't exist (Transloadit's real storage robots — `/s3/store`, `/dropbox/store`, etc. — all export to a specific external destination and need that destination's credentials). Then, removing the robot entirely turned out to be wrong too: Transloadit requires a non-empty `steps` object on every assembly (`ASSEMBLY_NO_STEPS` otherwise). The actual fix, and the documented pattern for "just accept the upload, no processing or export": a single `":original"` step using the `/upload/handle` robot and nothing else. The file's temporary `ssl_url` then shows up either under `results[":original"]` or the top-level `uploads` array depending on account/region — both code paths now check both locations rather than assuming one. The browser-side polling also needed a fix separately: it was hitting Transloadit's instance-specific subdomain (e.g. `api2-hu115ap.transloadit.com`), which failed to connect from one test environment — switched to the generic `api2.transloadit.com` endpoint, which Transloadit's own docs recommend as the reliable fallback.
- **A run getting stuck in "Running" forever with a failed node was a real bug** — fixed. The orchestrator was using a thrown error to mark a node FAILED in the database, but that exception then propagated up through `Promise.all` and crashed the whole task _before_ it reached the line that marks the Run as finished, permanently stranding the Run row at RUNNING the instant any single node failed. Node failures are now tracked in an explicit outcome map instead of via promise rejection, downstream nodes whose upstream failed are recorded as SKIPPED, and the run always reaches its finalize step (SUCCESS / PARTIAL / FAILED) regardless of which individual nodes failed. There's also now a **Cancel** button on any RUNNING run in the history panel as a manual safety valve for the cases this can't fully prevent (the Trigger.dev dev worker not running, a real network outage mid-poll, etc.) — it calls `runs.cancel()` on the orchestrator's Trigger.dev handle and marks everything FAILED/CANCELED in the DB regardless of whether the remote cancel call itself succeeds, so the UI is never left stuck. **This requires a schema change** — run `npx prisma migrate dev --name add-cancel-support` again before testing.
- **Not run against live services.** The data-resolution logic, DAG fan-out, and UI are built to spec and type-check cleanly, but real Gemini responses, real Trigger.dev run polling, and real Transloadit assemblies have not been exercised end-to-end. Expect to debug integration details (exact Trigger.dev run-status polling cadence, Transloadit assembly step naming, Gemini model string availability) once you plug in real keys.
- **Video/Audio/File inputs on the Gemini node** are visually present with correctly-typed handles for connections, but have no manual upload control wired up (only Prompt, System Prompt, and Image (Vision) support both connection and manual entry/upload). The required sample workflow only exercises Prompt and Image (Vision), so this doesn't block the core deliverable, but it's incomplete relative to the full node spec.
- **DAG cycle validation** runs on save (`PATCH /api/workflows/[id]`) but the canvas doesn't yet visually reject an in-progress drag that would create a cycle — it'll save-reject instead of connection-reject.
- **Pixel-matching the Galaxy.ai reference** was done from the written spec and the one reference screenshot in the assignment doc, not a live side-by-side against `try.galaxy.ai/clone` (not reachable from the sandbox this was built in). Expect to need a visual pass once you can compare directly.
- **Prisma major version**: pinned to 5.x here since that's what was verified; Prisma 6/7 are available if you'd rather be on the latest (Prisma 7 in particular changes some defaults around driver adapters — check their migration guide before jumping straight there).
