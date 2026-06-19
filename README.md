# NextFlow

A clone of the Galaxy.ai workflow builder, scoped to LLM workflows: Clerk auth, a dashboard of saved workflows, and a React Flow canvas where you wire together Request-Inputs, Crop Image, Gemini 3.1 Pro, and Response nodes, run them (full / multi-select / single-node) as parallel Trigger.dev tasks, and inspect every run in a node-level history panel.

## Status

This was scaffolded end-to-end and verified to compile cleanly: `npx tsc --noEmit`, `npx next lint`, and a full `next build` all pass (webpack compile + type check succeed; the only failure in this sandbox is `prisma generate` itself, because this environment can't reach `binaries.prisma.sh` — that step will work normally on your machine with internet access). It has **not** been run against live Clerk/Trigger.dev/Transloadit/Gemini/Postgres, since none of those services are reachable from the sandbox this was built in. Budget time to wire up real keys and shake out integration bugs — see "Known limitations" below for the spots most likely to need attention.

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

**Transloadit** (image upload + crop storage) — [transloadit.com](https://transloadit.com) → create an account → copy your Auth Key/Secret into `TRANSLOADIT_AUTH_KEY` / `TRANSLOADIT_AUTH_SECRET`. Create a template with a `/file/store` (or similar) step and put its ID in `TRANSLOADIT_TEMPLATE_ID` — used for client-side image_field uploads in `/api/upload`. The Crop Image task uploads its FFmpeg output via the same account but builds its own assembly steps directly, so the template is only required for the client upload path.

## 3. Set up the database

```bash
npx prisma generate
npx prisma migrate dev --name init
```

## 4. Run it

You need two processes running side by side:

```bash
npm run dev          # Next.js app on localhost:3000
npm run trigger:dev   # Trigger.dev dev worker — required for any node to actually execute
```

Without the second process running, "Run Workflow" will start a run that never completes, since nothing is listening for the `crop-image`, `gemini-generate`, or `run-workflow` tasks.

## 5. Deploy

- Push to GitHub, import into Vercel, add all the same env vars there.
- Deploy your Trigger.dev project separately (`npx trigger.dev@latest deploy`) and point `TRIGGER_SECRET_KEY`/`TRIGGER_PROJECT_ID` at the deployed environment, not the dev one.

## The required sample workflow

The spec requires the exact product-description pipeline from its Nodes/Edges table to ship pre-built. Rather than a static seed script tied to one Clerk user id (which can't be known ahead of time), click **Load Sample Workflow** on the dashboard — it creates that exact 7-node graph (Request-Inputs → 2x Crop Image + Gemini #1 → Gemini #2 → Final Gemini → Response, with the system prompts and crop percentages from the spec) for whichever account is signed in. Upload a product photo into the `image_field` after loading it, then Run Workflow.

## Architecture notes

- **Auth**: `middleware.ts` protects every route except `/sign-in` and `/sign-up`; unauthenticated visitors are redirected straight to Clerk, with no marketing/landing page, per spec.
- **Data model**: `prisma/schema.prisma` — a `Workflow` stores its full React Flow graph as JSON (`nodes`/`edges`), so the canvas can rehydrate exactly what was saved with no transform. `Run`/`NodeRun` persist execution history independently, so history survives later edits to the live graph.
- **DAG execution**: `src/lib/graph.ts` has the pure dependency-resolution and input-resolution logic (connection overrides manual entry, multi-connection handles like Image (Vision) collect into an array). `src/trigger/runWorkflow.ts` is the orchestrator task: it gives every node in the execution set its own promise that awaits only its direct upstream dependencies, so independent siblings fire concurrently at T=0 and a finished node fans out to its dependents immediately, without blocking on unrelated nodes at the same DAG level — this is what the spec's "parallel execution" and "selective execution" requirements come down to.
- **Single-node / multi-select runs**: per spec, these execute *only* the targeted nodes, not their upstream dependencies. The orchestrator seeds its in-memory outputs map from every node's last-known persisted output (`getCachedNodeOutput`) so a node being re-run still resolves its connected inputs correctly even though its upstream wasn't re-executed.
- **The 30s Crop Image delay** is enforced inside the task itself (`src/trigger/cropImage.ts`), measured from task start, regardless of how fast FFmpeg actually finishes.
- **Live UI updates**: `WorkflowClient.tsx` polls `/api/workflows/[id]/history` every 2s, applying the latest run's per-node statuses (drives the pulsing-glow border in `NodeShell`) and outputs back onto the canvas nodes.
- **Build attribution console.log**: the assignment doc requires logging a candidate LinkedIn URL on every page load. This is implemented in `src/components/AttributionLog.tsx`, reading from `NEXT_PUBLIC_CANDIDATE_LINKEDIN_URL` so nothing is hardcoded — leave that env var blank to log nothing, or delete the component entirely if you'd rather not include it.

## Known limitations / what to check first

- **A run getting stuck in "Running" forever with a failed node, like the one shown in your screenshot, was a real bug** — fixed. The orchestrator was using a thrown error to mark a node FAILED in the database, but that exception then propagated up through `Promise.all` and crashed the whole task *before* it reached the line that marks the Run as finished, permanently stranding the Run row at RUNNING the instant any single node failed. Node failures are now tracked in an explicit outcome map instead of via promise rejection, downstream nodes whose upstream failed are recorded as SKIPPED, and the run always reaches its finalize step (SUCCESS / PARTIAL / FAILED) regardless of which individual nodes failed. There's also now a **Cancel** button on any RUNNING run in the history panel as a manual safety valve for the cases this can't fully prevent (the Trigger.dev dev worker not running, a real network outage mid-poll, etc.) — it calls `runs.cancel()` on the orchestrator's Trigger.dev handle and marks everything FAILED/CANCELED in the DB regardless of whether the remote cancel call itself succeeds, so the UI is never left stuck. **This requires a schema change** — run `npx prisma migrate dev --name add-cancel-support` again before testing.
- **Not run against live services.** The data-resolution logic, DAG fan-out, and UI are built to spec and type-check cleanly, but real Gemini responses, real Trigger.dev run polling, and real Transloadit assemblies have not been exercised end-to-end. Expect to debug integration details (exact Trigger.dev run-status polling cadence, Transloadit assembly step naming, Gemini model string availability) once you plug in real keys.
- **Video/Audio/File inputs on the Gemini node** are visually present with correctly-typed handles for connections, but have no manual upload control wired up (only Prompt, System Prompt, and Image (Vision) support both connection and manual entry/upload). The required sample workflow only exercises Prompt and Image (Vision), so this doesn't block the core deliverable, but it's incomplete relative to the full node spec.
- **DAG cycle validation** runs on save (`PATCH /api/workflows/[id]`) but the canvas doesn't yet visually reject an in-progress drag that would create a cycle — it'll save-reject instead of connection-reject.
- **Pixel-matching the Galaxy.ai reference** was done from the written spec and the one reference screenshot in the assignment doc, not a live side-by-side against `try.galaxy.ai/clone` (not reachable from the sandbox this was built in). Expect to need a visual pass once you can compare directly.
- **Prisma major version**: pinned to 5.x here since that's what was verified; Prisma 6/7 are available if you'd rather be on the latest (Prisma 7 in particular changes some defaults around driver adapters — check their migration guide before jumping straight there).
