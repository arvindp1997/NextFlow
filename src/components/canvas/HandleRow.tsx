"use client";

import { Handle, Position } from "@xyflow/react";
import type { ReactNode } from "react";
import { useWorkflowStore } from "@/store/workflowStore";
import { HANDLE_COLORS, type HandleDataType } from "@/lib/types";
import { cn } from "@/lib/utils";

export function useIsHandleConnected(nodeId: string, handleId: string, side: "source" | "target"): boolean {
  const edges = useWorkflowStore((s) => s.edges);
  return edges.some((e) =>
    side === "target" ? e.target === nodeId && (e.targetHandle ?? "") === handleId : e.source === nodeId && (e.sourceHandle ?? "") === handleId
  );
}

export function InputHandleRow({
  nodeId,
  handleId,
  label,
  dataType,
  required,
  children,
}: {
  nodeId: string;
  handleId: string;
  label: string;
  dataType: HandleDataType;
  required?: boolean;
  children: ReactNode;
}) {
  const connected = useIsHandleConnected(nodeId, handleId, "target");
  return (
    <div className="relative">
      <Handle
        id={handleId}
        type="target"
        position={Position.Left}
        style={{ background: HANDLE_COLORS[dataType], left: -7 }}
      />
      <label className="mb-1 flex items-center gap-1 text-[11px] font-medium text-zinc-500">
        {label}
        {required && <span className="text-orange-500">*</span>}
        {connected && <span className="ml-auto text-[10px] font-normal text-zinc-400">connected</span>}
      </label>
      <div className={cn(connected && "pointer-events-none opacity-50")}>{children}</div>
    </div>
  );
}

export function OutputHandleRow({
  handleId,
  label,
  dataType,
}: {
  nodeId?: string;
  handleId: string;
  label: string;
  dataType: HandleDataType;
}) {
  return (
    <div className="relative flex items-center justify-end">
      <span className="text-[11px] font-medium text-zinc-500">{label}</span>
      <Handle
        id={handleId}
        type="source"
        position={Position.Right}
        style={{ background: HANDLE_COLORS[dataType], right: -7 }}
      />
    </div>
  );
}
