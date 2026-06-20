"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import Link from "next/link";
import { ReactFlowProvider } from "@xyflow/react";
import {
  ArrowLeft,
  Play,
  Undo2,
  Redo2,
  Loader2,
  CheckCircle2,
} from "lucide-react";
import { WorkflowCanvas } from "@/components/canvas/WorkflowCanvas";
import { HistoryPanel, type RunRecord } from "@/components/canvas/HistoryPanel";
import { Sidebar } from "@/components/dashboard/Sidebar";
import { Button } from "@/components/ui/Button";
import { useWorkflowStore, type FlowNode, type FlowEdge } from "@/store/workflowStore";
import { useRunRequestStore } from "@/store/runRequestStore";

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
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved">("idle");
  const [nameInput, setNameInput] = useState(name);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Initial load into the canvas store.
  useEffect(() => {
    store.load(workflowId, name, nodes, edges);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workflowId]);

  // Debounced autosave whenever the canvas is marked dirty.
  useEffect(() => {
    const unsub = useWorkflowStore.subscribe((state, prev) => {
      if (!state.dirty || (state.nodes === prev.nodes && state.edges === prev.edges)) return;
      if (saveTimer.current) clearTimeout(saveTimer.current);
      setSaveState("saving");
      saveTimer.current = setTimeout(async () => {
        await fetch(`/api/workflows/${workflowId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ nodes: state.nodes, edges: state.edges }),
        });
        setSaveState("saved");
      }, 900);
    });
    return unsub;
  }, [workflowId]);

  const refreshHistory = useCallback(async () => {
    const res = await fetch(`/api/workflows/${workflowId}/history`);
    if (!res.ok) return;
    const { runs: fetched } = (await res.json()) as { runs: RunRecord[] };
    setRuns(fetched);
    setHistoryLoading(false);

    const latest = fetched[0];
    if (latest) {
      const statusMap: Record<string, "idle" | "pending" | "running" | "success" | "failed"> = {};
      const resultMap: Record<string, unknown> = {};
      for (const nr of latest.nodeRuns) {
        statusMap[nr.nodeId] = nr.status.toLowerCase() as "pending" | "running" | "success" | "failed";
        if (nr.output !== undefined && nr.output !== null) resultMap[nr.nodeId] = nr.output;
      }
      useWorkflowStore.getState().applyRunStatuses(statusMap);
      useWorkflowStore.getState().applyNodeResults(resultMap);
    }
  }, [workflowId]);

  useEffect(() => {
    refreshHistory();
    const interval = setInterval(refreshHistory, 2000);
    return () => clearInterval(interval);
  }, [refreshHistory]);

  const runWorkflow = useCallback(
    async (scope: "full" | "partial" | "single", targetNodeIds: string[] = []) => {
      await fetch(`/api/workflows/${workflowId}/run`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scope, targetNodeIds }),
      });
      refreshHistory();
    },
    [workflowId, refreshHistory]
  );

  const cancelRun = useCallback(
    async (runId: string) => {
      await fetch(`/api/workflows/${workflowId}/run/${runId}/cancel`, { method: "POST" });
      refreshHistory();
    },
    [workflowId, refreshHistory]
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
      <Sidebar defaultCollapsed persist={false} />
      <div className="flex h-screen flex-1 flex-col bg-canvas">
      <header className="flex items-center justify-between border-b border-border bg-white px-4 py-2.5">
        <div className="flex min-w-0 items-center gap-2">
          <Link href="/dashboard" className="rounded-md p-1.5 text-zinc-500 hover:bg-zinc-100">
            <ArrowLeft size={16} />
          </Link>
          <input
            className="min-w-0 max-w-xs truncate rounded-md px-1.5 py-1 text-sm font-medium text-zinc-900 outline-none hover:bg-zinc-50 focus:bg-zinc-50"
            value={nameInput}
            onChange={(e) => setNameInput(e.target.value)}
            onBlur={handleRenameBlur}
          />
          <SaveIndicator state={saveState} />
        </div>

        <div className="flex items-center gap-1.5">
          <Button variant="ghost" size="sm" onClick={() => store.undo()} aria-label="Undo">
            <Undo2 size={14} />
          </Button>
          <Button variant="ghost" size="sm" onClick={() => store.redo()} aria-label="Redo">
            <Redo2 size={14} />
          </Button>
          {selectedCount > 1 && (
            <Button size="sm" onClick={() => runWorkflow("partial", store.selectedNodeIds)}>
              <Play size={13} /> Run Selected ({selectedCount})
            </Button>
          )}
          <Button size="sm" onClick={() => runWorkflow("full")}>
            <Play size={13} /> Run Workflow
          </Button>
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden">
        <div className="flex-1">
          <ReactFlowProvider>
            <WorkflowCanvas />
          </ReactFlowProvider>
        </div>
        <HistoryPanel runs={runs} loading={historyLoading} onCancel={cancelRun} />
      </div>
      </div>
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