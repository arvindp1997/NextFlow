"use client";

import { useState } from "react";
import { ChevronDown, ChevronRight, CheckCircle2, XCircle, AlertCircle, Loader2, MinusCircle, Ban } from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { formatDuration, formatRelativeTime } from "@/lib/utils";

export interface NodeRunRecord {
  id: string;
  nodeId: string;
  nodeType: string;
  nodeLabel: string;
  status: "PENDING" | "RUNNING" | "SUCCESS" | "FAILED" | "SKIPPED";
  inputs: Record<string, unknown>;
  output?: unknown;
  error?: string | null;
  startedAt?: string | null;
  completedAt?: string | null;
  durationMs?: number | null;
}

export interface RunRecord {
  id: string;
  status: "RUNNING" | "SUCCESS" | "FAILED" | "PARTIAL" | "CANCELED";
  scope: "FULL" | "PARTIAL" | "SINGLE";
  startedAt: string;
  completedAt?: string | null;
  durationMs?: number | null;
  nodeRuns: NodeRunRecord[];
}

export function HistoryPanel({
  runs,
  loading,
  onCancel,
  onClose,
}: {
  runs: RunRecord[];
  loading: boolean;
  onCancel: (runId: string) => void;
  onClose: () => void;
}) {
  const [expandedRunId, setExpandedRunId] = useState<string | null>(null);

  return (
    <aside className="flex h-screen w-80 shrink-0 flex-col border-l border-border bg-white">
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <div>
          <h2 className="text-sm font-semibold text-zinc-900">Execution History</h2>
          <p className="text-xs text-zinc-400">All runs for this workflow</p>
        </div>
        <button onClick={onClose} className="text-xs font-medium text-zinc-500 hover:text-zinc-800">
          Close
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-2 py-2">
        {loading && runs.length === 0 && <p className="px-2 py-4 text-center text-xs text-zinc-400">Loading…</p>}
        {!loading && runs.length === 0 && <p className="px-2 py-4 text-center text-xs text-zinc-400">No runs yet</p>}

        {runs.map((run) => {
          const expanded = expandedRunId === run.id;
          return (
            <div key={run.id} className="mb-1.5 rounded-xl border border-border">
              <button
                className="flex w-full items-center justify-between px-3 py-2.5 text-left"
                onClick={() => setExpandedRunId(expanded ? null : run.id)}
              >
                <div className="flex items-center gap-1.5">
                  {expanded ? <ChevronDown size={13} className="text-zinc-400" /> : <ChevronRight size={13} className="text-zinc-400" />}
                  <RunStatusIcon status={run.status} />
                  <span className="text-xs font-medium text-zinc-700">
                    {run.scope === "FULL" ? "Full Workflow" : run.scope === "SINGLE" ? "Single Node" : "Multi-select"}
                  </span>
                </div>
                <span className="text-[11px] text-zinc-400">{formatRelativeTime(run.startedAt)}</span>
              </button>

              <div className="flex items-center justify-between gap-2 px-3 pb-2.5">
                <div className="flex items-center gap-2">
                  <RunBadge status={run.status} />
                  <span className="text-[11px] text-zinc-400">{formatDuration(run.durationMs)}</span>
                </div>
                {run.status === "RUNNING" && (
                  <Button
                    variant="danger"
                    size="sm"
                    className="h-6 px-2 text-[11px]"
                    onClick={(e) => {
                      e.stopPropagation();
                      onCancel(run.id);
                    }}
                  >
                    <Ban size={11} /> Cancel
                  </Button>
                )}
              </div>

              {expanded && (
                <div className="space-y-1.5 border-t border-border px-3 py-2.5">
                  {run.nodeRuns.length === 0 && <p className="text-xs text-zinc-400">No node runs recorded</p>}
                  {run.nodeRuns.map((nr) => (
                    <NodeRunRow key={nr.id} nodeRun={nr} />
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </aside>
  );
}

function NodeRunRow({ nodeRun }: { nodeRun: NodeRunRecord }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="rounded-lg bg-zinc-50">
      <button className="flex w-full items-center justify-between px-2 py-1.5 text-left" onClick={() => setOpen((v) => !v)}>
        <span className="flex items-center gap-1.5 text-xs text-zinc-700">
          <RunStatusIcon status={nodeRun.status} small />
          {nodeRun.nodeLabel}
        </span>
        <span className="text-[10px] text-zinc-400">{formatDuration(nodeRun.durationMs)}</span>
      </button>
      {open && (
        <div className="space-y-1.5 px-2 pb-2 text-[11px] text-zinc-500">
          <div>
            <span className="font-medium text-zinc-600">Inputs: </span>
            <code className="break-all">{JSON.stringify(nodeRun.inputs)}</code>
          </div>
          {nodeRun.output !== undefined && (
            <div>
              <span className="font-medium text-zinc-600">Output: </span>
              <code className="break-all">{JSON.stringify(nodeRun.output)}</code>
            </div>
          )}
          {nodeRun.error && <div className="text-red-600">Error: {nodeRun.error}</div>}
        </div>
      )}
    </div>
  );
}

function RunStatusIcon({ status, small }: { status: string; small?: boolean }) {
  const size = small ? 11 : 13;
  if (status === "RUNNING" || status === "PENDING") return <Loader2 size={size} className="animate-spin text-orange-500" />;
  if (status === "SUCCESS") return <CheckCircle2 size={size} className="text-emerald-500" />;
  if (status === "FAILED") return <XCircle size={size} className="text-red-500" />;
  if (status === "PARTIAL") return <AlertCircle size={size} className="text-amber-500" />;
  if (status === "SKIPPED") return <MinusCircle size={size} className="text-zinc-400" />;
  if (status === "CANCELED") return <Ban size={size} className="text-zinc-400" />;
  return null;
}

function RunBadge({ status }: { status: RunRecord["status"] }) {
  if (status === "SUCCESS") return <Badge tone="green">Success</Badge>;
  if (status === "FAILED") return <Badge tone="red">Failed</Badge>;
  if (status === "PARTIAL") return <Badge tone="yellow">Partial</Badge>;
  if (status === "CANCELED") return <Badge tone="gray">Canceled</Badge>;
  return <Badge tone="orange">Running</Badge>;
}