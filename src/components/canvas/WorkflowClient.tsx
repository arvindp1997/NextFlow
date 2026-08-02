"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import Link from "next/link";
import { ReactFlowProvider } from "@xyflow/react";
import {
  ArrowLeft,
  Play,
  Loader2,
  CheckCircle2,
  History,
  Calculator,
  Wallet,
} from "lucide-react";
import { WorkflowCanvas } from "@/components/canvas/WorkflowCanvas";
import { HistoryPanel, type RunRecord } from "@/components/canvas/HistoryPanel";
import { Sidebar } from "@/components/dashboard/Sidebar";
import { Button } from "@/components/ui/Button";
import { Tooltip } from "./Tooltip";
import { cn } from "@/lib/utils";
import {
  useWorkflowStore,
  type FlowNode,
  type FlowEdge,
} from "@/store/workflowStore";
import type { RequestInputsNodeData } from "@/lib/types";
import { useRunRequestStore } from "@/store/runRequestStore";
import { RunRealtimeSync, type ActiveRun } from "@/components/canvas/RunRealtimeSync";

export function WorkflowClient({
  workflowId,
  name,
  nodes,
  edges,
}: {
  workflowId: string;
  name: string;
  nodes: FlowNode[];
  edges: FlowEdge[];
}) {
  const store = useWorkflowStore();
  const [runs, setRuns] = useState<RunRecord[]>([]);
  const [historyLoading, setHistoryLoading] = useState(true);
  // The run currently being watched via Trigger.dev Realtime (useRealtimeRun
  // below) — set right after POST /run, or re-derived from the history
  // endpoint on load if a run was already in flight (e.g. page refresh).
  const [activeRun, setActiveRun] = useState<ActiveRun | null>(null);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved">("idle");
  const [nameInput, setNameInput] = useState(name);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Tracks whether the debounced autosave below still needs to fire for the
  // current edits. Read by runWorkflow() so a Run click can flush it first
  // instead of racing it — see persistWorkflow/runWorkflow.
  const pendingSaveRef = useRef(false);

  const isRunning = runs[0]?.status === "RUNNING";

  // Validate that all request-inputs fields have values before allowing a run.
  const storeNodes = useWorkflowStore((s) => s.nodes);
  const requestInputsNode = storeNodes.find((n) => n.data.kind === "request-inputs");
  const emptyFields = requestInputsNode
    ? (requestInputsNode.data as RequestInputsNodeData).fields.filter(
        (f) => !f.value || String(f.value).trim() === ""
      )
    : [];
  const hasEmptyFields = emptyFields.length > 0;
  const emptyFieldsTooltip = hasEmptyFields
    ? `Fill in required fields:\n${emptyFields.map((f) => f.name).join(", ")}`
    : isRunning
    ? "Workflow is running…"
    : "Run workflow";

  // Initial load into the canvas store.
  useEffect(() => {
    // Fast initial paint using the (possibly stale) server-rendered props —
    // avoids a flash of an empty canvas while the fetch below resolves.
    store.load(workflowId, name, nodes, edges);

    // Then always confirm with a fresh client-side fetch. A plain fetch()
    // bypasses Next.js's Router Cache entirely, unlike the RSC props above
    // — which CAN be served stale when this route is reached via a
    // client-side <Link> shortly after another page (e.g. the Playground
    // tab) mutated this same workflow through a plain API route. Next has
    // no automatic way to know that mutation happened, since we don't use
    // Server Actions/revalidatePath here.
    (async () => {
      try {
        const res = await fetch(`/api/workflows/${workflowId}`);
        if (!res.ok) return;
        const json = await res.json();
        useWorkflowStore.getState().load(workflowId, json.workflow.name, json.workflow.nodes, json.workflow.edges);
      } catch {
        // Non-fatal — the props-seeded store above still works, just
        // potentially stale.
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workflowId]);

  // Persists whatever is CURRENTLY in the canvas store to the DB, right now
  // (no debounce). Pulled out of the autosave effect so runWorkflow() can
  // also call it directly before triggering a run.
  const persistWorkflow = useCallback(async () => {
    if (saveTimer.current) {
      clearTimeout(saveTimer.current);
      saveTimer.current = null;
    }
    const state = useWorkflowStore.getState();
    setSaveState("saving");
    await fetch(`/api/workflows/${workflowId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ nodes: state.nodes, edges: state.edges }),
    });
    pendingSaveRef.current = false;
    setSaveState("saved");
  }, [workflowId]);

  // Debounced autosave whenever the canvas is marked dirty.
  useEffect(() => {
    const unsub = useWorkflowStore.subscribe((state, prev) => {
      if (
        !state.dirty ||
        (state.nodes === prev.nodes && state.edges === prev.edges)
      )
        return;
      if (saveTimer.current) clearTimeout(saveTimer.current);
      pendingSaveRef.current = true;
      setSaveState("saving");
      saveTimer.current = setTimeout(persistWorkflow, 900);
    });
    return unsub;
  }, [persistWorkflow]);

  // Fetches the run list from Postgres (full inputs/outputs/durations for
  // the History panel). Called once on mount, once right after a run is
  // kicked off, and once when the active run settles — never on an
  // interval; live in-progress status comes from the Realtime subscription
  // below instead.
  const refreshHistory = useCallback(async () => {
    const res = await fetch(`/api/workflows/${workflowId}/history`);
    if (!res.ok) return;
    const { runs: fetched, activeRun: fetchedActiveRun } = (await res.json()) as {
      runs: RunRecord[];
      activeRun: ActiveRun | null;
    };
    setRuns(fetched);
    setHistoryLoading(false);

    // Resume Realtime for a run that was already in flight when this page
    // loaded (e.g. the user refreshed mid-run) instead of only ever being
    // able to attach right after this tab's own POST /run.
    setActiveRun((current) => current ?? fetchedActiveRun ?? null);

    const latest = fetched[0];
    if (latest) {
      const statusMap: Record<
        string,
        "idle" | "pending" | "running" | "success" | "failed"
      > = {};
      const resultMap: Record<string, unknown> = {};
      for (const nr of latest.nodeRuns) {
        const status = nr.status.toLowerCase();
        statusMap[nr.nodeId] = status === "skipped" ? "failed" : (status as "pending" | "running" | "success" | "failed");
        if (nr.output !== undefined && nr.output !== null)
          resultMap[nr.nodeId] = nr.output;
      }
      useWorkflowStore.getState().applyRunStatuses(statusMap);
      useWorkflowStore.getState().applyNodeResults(resultMap);
    }
  }, [workflowId]);

  useEffect(() => {
    refreshHistory();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workflowId]);

  // Debounce timer for the Realtime-triggered history refetch below —
  // coalesces a burst of metadata events (several nodes transitioning close
  // together) into a single fetch, and gives the NodeRun row's own DB write
  // (issued right around the same time as the metadata push, see
  // executeNode() in src/trigger/runWorkflow.ts) a brief moment to land
  // before we read it back.
  const historyRefreshTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (historyRefreshTimer.current) clearTimeout(historyRefreshTimer.current);
    };
  }, []);

  // Applies the live per-node status pushed over Trigger.dev Realtime
  // (run.metadata.nodeStatuses, set by runWorkflowTask — see
  // src/trigger/runWorkflow.ts) directly to the canvas, so nodes light up
  // as they actually start/finish with no DB round-trip in the loop. The
  // History sidebar reads from Postgres (it needs full inputs/outputs, not
  // just a status label), so each metadata event also schedules a single
  // debounced refetch — reactive to this real event, not a fixed interval.
  const applyLiveNodeStatuses = useCallback((statuses: Record<string, string>) => {
    const statusMap: Record<string, "idle" | "pending" | "running" | "success" | "failed"> = {};
    for (const [nodeId, status] of Object.entries(statuses)) {
      statusMap[nodeId] = status === "skipped" ? "failed" : (status as "pending" | "running" | "success" | "failed");
    }
    useWorkflowStore.getState().applyRunStatuses(statusMap);

    if (historyRefreshTimer.current) clearTimeout(historyRefreshTimer.current);
    historyRefreshTimer.current = setTimeout(() => {
      historyRefreshTimer.current = null;
      refreshHistory();
    }, 400);
  }, [refreshHistory]);

  // Once the watched run reaches a terminal state, pull the full record
  // (durations, inputs/outputs, error messages) for the History panel and
  // stop watching.
  const handleRunSettled = useCallback(() => {
    if (historyRefreshTimer.current) {
      clearTimeout(historyRefreshTimer.current);
      historyRefreshTimer.current = null;
    }
    setActiveRun(null);
    refreshHistory();
  }, [refreshHistory]);

  const runWorkflow = useCallback(
    async (
      scope: "full" | "partial" | "single",
      targetNodeIds: string[] = [],
    ) => {
      // The /run route reads node data straight from the DB, but node edits
      // (slider drags, a fresh image upload, etc.) only reach the DB via the
      // 900ms-debounced autosave above. Without this flush, clicking Run
      // shortly after an edit executes against a stale snapshot — the crop
      // node's server-side output then won't match what's shown in the
      // canvas preview (and, if this node feeds a Response node directly,
      // the Response card renders whatever stale/missing value came back).
      // Flushing here guarantees the server always sees the latest state.
      if (pendingSaveRef.current) {
        await persistWorkflow();
      }
      const res = await fetch(`/api/workflows/${workflowId}/run`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scope, targetNodeIds }),
      });
      if (res.ok) {
        const data = (await res.json()) as { runId: string; triggerRunId: string; publicAccessToken: string };
        setActiveRun(data);
      }
      refreshHistory();
    },
    [workflowId, refreshHistory, persistWorkflow],
  );

  const cancelRun = useCallback(
    async (runId: string) => {
      await fetch(`/api/workflows/${workflowId}/run/${runId}/cancel`, {
        method: "POST",
      });
      setActiveRun(null);
      refreshHistory();
    },
    [workflowId, refreshHistory],
  );

  // Single-node run requests fired from inside a node's "Run" button.
  useEffect(() => {
    const unsub = useRunRequestStore.subscribe((state) => {
      if (state.nodeId) runWorkflow("single", [state.nodeId]);
    });
    return unsub;
  }, [runWorkflow]);

  async function handleRenameBlur() {
    if (nameInput.trim() && nameInput !== name) {
      await fetch(`/api/workflows/${workflowId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: nameInput.trim() }),
      });
    }
  }

  const selectedCount = store.selectedNodeIds.length;

  return (
    <div className="flex h-screen">
      {activeRun && (
        <RunRealtimeSync
          activeRun={activeRun}
          onNodeStatuses={applyLiveNodeStatuses}
          onSettled={handleRunSettled}
        />
      )}
      <Sidebar defaultCollapsed persist={false} />
      <div className="relative h-screen flex-1 bg-canvas">
        {/* Full-height canvas underneath everything — the header and the
            bottom toolbar are both floating overlays on top of it (z-20),
            not flex siblings that carve out their own space. This is what
            lets a dragged node stay visible underneath the header/toolbar,
            the same way it already does under the bottom toolbar, instead
            of getting hard-clipped at a boundary that happens to sit right
            below the header. */}
        <div className="absolute inset-0">
          <ReactFlowProvider>
            <WorkflowCanvas />
          </ReactFlowProvider>
        </div>

        <header className="absolute left-0 right-0 top-0 z-20 flex items-center justify-between px-4 py-2.5">
          <div className="inline-flex items-center gap-3 rounded-2xl border border-zinc-200 bg-white px-3 py-2 shadow-[0_2px_8px_rgba(0,0,0,0.06)]">
            <Link
              href={`/workflow/${workflowId}`}
              className="flex h-9 w-9 items-center justify-center rounded-xl border border-zinc-200 bg-white text-zinc-600 transition-colors hover:bg-zinc-50"
            >
              <ArrowLeft size={18} />
            </Link>

            <input
              className="
      min-w-0
      max-w-xs
      bg-transparent
      text-sm
      font-medium
      text-zinc-800
      outline-none
      placeholder:text-zinc-400
    "
              value={nameInput}
              onChange={(e) => setNameInput(e.target.value)}
              onBlur={handleRenameBlur}
            />

            <SaveIndicator state={saveState} />
          </div>

          <div className="flex items-center gap-1.5">
            {/* Decorative, like the per-node cost indicators elsewhere — there's no
              real token/billing tracking anywhere in the app. */}
            <div className="flex items-center gap-1 rounded-lg border border-border bg-zinc-50 px-2.5 py-1.5 text-[11px] font-medium text-zinc-500">
              <Calculator size={12} /> Est{" "}
              <span className="text-zinc-700">0.01 M</span>
            </div>
            <div className="flex items-center gap-1 rounded-lg border border-border bg-zinc-50 px-2.5 py-1.5 text-[11px] font-medium text-zinc-500">
              <Wallet size={12} /> Bal{" "}
              <span className="text-zinc-700">0.00 M</span>
            </div>
            {selectedCount > 1 && (
              <Button
                size="sm"
                onClick={() => runWorkflow("partial", store.selectedNodeIds)}
                disabled={isRunning}
              >
                <Play size={13} /> Run Selected ({selectedCount})
              </Button>
            )}
            <Tooltip label={emptyFieldsTooltip} side="bottom">
              <button
                onClick={() => runWorkflow("full")}
                disabled={isRunning || hasEmptyFields}
                className="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50"
                aria-label="Run workflow"
              >
                {isRunning ? <Loader2 size={14} className="animate-spin" /> : <Play size={14} fill="currentColor" />}
              </button>
            </Tooltip>
            {!historyOpen && (
              <Tooltip label="Run History" side="bottom">
                <button
                  onClick={() => setHistoryOpen((v) => !v)}
                  className={cn(
                    "flex h-8 w-8 items-center justify-center rounded-md border bg-white border-border",
                    historyOpen
                      ? "bg-zinc-900 text-white"
                      : "text-black hover:bg-zinc-100 hover:text-zinc-700",
                  )}
                  aria-label="Run History"
                >
                  <History size={14} />
                </button>
              </Tooltip>
            )}
          </div>
        </header>
      </div>
      {historyOpen && (
        <HistoryPanel
          runs={runs}
          loading={historyLoading}
          onCancel={cancelRun}
          onClose={() => setHistoryOpen(false)}
        />
      )}
    </div>
  );
}


function SaveIndicator({ state }: { state: "idle" | "saving" | "saved" }) {
  if (state === "saving")
    return (
      <span className="flex items-center gap-1 text-[11px] text-zinc-400">
        <Loader2 size={11} className="animate-spin" /> Saving…
      </span>
    );
  if (state === "saved")
    return (
      <span className="flex items-center gap-1 text-[11px] text-zinc-400">
        <CheckCircle2 size={11} /> Saved
      </span>
    );
  return null;
}