"use client";

import { MoreHorizontal, Loader2, CheckCircle2, XCircle, Trash2, Play, Coins } from "lucide-react";
import { useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";
import { useWorkflowStore } from "@/store/workflowStore";
import { useRunRequestStore } from "@/store/runRequestStore";
import type { NodeRunStatus } from "@/lib/types";

/**
 * Purely decorative — there's no real token/pricing computation wired up
 * anywhere in the app. This just matches the visual in the reference UI.
 */
export function CostIndicator({ estimate }: { estimate: string }) {
  return (
    <div className="flex items-center justify-end gap-1 text-[11px] text-zinc-400">
      <Coins size={11} /> ~{estimate}
    </div>
  );
}

export function NodeShell({
  nodeId,
  title,
  titleSlot,
  headerExtra,
  runStatus = "idle",
  deletable = true,
  runnable = false,
  width = "w-72",
  children,
  footer,
  selected,
}: {
  nodeId: string;
  title: string;
  titleSlot?: ReactNode;
  headerExtra?: ReactNode;
  runStatus?: NodeRunStatus;
  deletable?: boolean;
  runnable?: boolean;
  width?: string;
  children: ReactNode;
  footer?: ReactNode;
  selected?: boolean,
}) {
  const deleteNode = useWorkflowStore((s) => s.deleteNode);
  const requestSingleRun = useRunRequestStore((s) => s.requestSingleRun);
  const [menuOpen, setMenuOpen] = useState(false);

  return (
   <div
  className={cn(
    width,
    "rounded-2xl bg-white shadow-card transition-all",
    selected
      ? "border-2 border-indigo-500"
      : "border border-border",
    runStatus === "running" &&
      !selected &&
      "border-purple-300 animate-pulse-glow",
    runStatus === "failed" &&
      !selected &&
      "border-red-300"
  )}
>
      <div className="flex items-center justify-between gap-2 border-b border-border px-3 py-2.5">
        <div className="flex min-w-0 items-center gap-2">
          <span className="truncate text-[13px] font-semibold text-zinc-800">{title}</span>
          {titleSlot}
        </div>
        <div className="flex items-center gap-1.5">
          {headerExtra}
          <StatusPill status={runStatus} />
          {runnable && runStatus !== "running" && (
            <button
              className="flex items-center gap-1 rounded-lg bg-emerald-100 px-2.5 py-1 text-[12px] font-medium text-emerald-700 hover:bg-emerald-200"
              onClick={() => requestSingleRun(nodeId)}
              aria-label="Run node"
            >
              <Play size={11} /> Run
            </button>
          )}
          {deletable && (
            <div className="relative">
              <button
                className="rounded-md border border-border p-1 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-600"
                onClick={() => setMenuOpen((v) => !v)}
                aria-label="Node menu"
              >
                <MoreHorizontal size={15} />
              </button>
              {menuOpen && (
                <div className="absolute right-0 z-10 mt-1 w-32 rounded-lg border border-border bg-white py-1 shadow-lg">
                  <button
                    className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm text-red-600 hover:bg-zinc-50"
                    onClick={() => {
                      setMenuOpen(false);
                      deleteNode(nodeId);
                    }}
                  >
                    <Trash2 size={13} /> Delete
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      <div className="space-y-3 px-3 py-3">{children}</div>

      {footer && <div className="border-t border-border px-3 py-2.5">{footer}</div>}
    </div>
  );
}

function StatusPill({ status }: { status: NodeRunStatus }) {
  if (status === "running")
    return (
      <span className="flex items-center gap-1 rounded-full bg-orange-50 px-2 py-0.5 text-[11px] font-medium text-orange-600">
        <Loader2 size={10} className="animate-spin" /> Running
      </span>
    );
  if (status === "success")
    return (
      <span className="flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-medium text-emerald-600">
        <CheckCircle2 size={10} /> Done
      </span>
    );
  if (status === "failed")
    return (
      <span className="flex items-center gap-1 rounded-full bg-red-50 px-2 py-0.5 text-[11px] font-medium text-red-600">
        <XCircle size={10} /> Failed
      </span>
    );
  return null;
}