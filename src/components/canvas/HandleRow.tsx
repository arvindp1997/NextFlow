"use client";

import { Handle, Position } from "@xyflow/react";
import type { ReactNode } from "react";
import { useWorkflowStore } from "@/store/workflowStore";
import { HANDLE_COLORS, type HandleDataType } from "@/lib/types";
import { cn } from "@/lib/utils";
import { Tooltip } from "../ui/Tooltip";

export function useIsHandleConnected(nodeId: string, handleId: string, side: "source" | "target"): boolean {
  const edges = useWorkflowStore((s) => s.edges);
  return edges.some((e) =>
    side === "target" ? e.target === nodeId && (e.targetHandle ?? "") === handleId : e.source === nodeId && (e.sourceHandle ?? "") === handleId
  );
}

/**
 * For a connected single-source input handle, returns the upstream node's
 * current value so connected (disabled) fields can preview real data
 * instead of sitting empty — purely cosmetic, the actual value resolution
 * for execution happens server-side in src/lib/graph.ts regardless of what
 * this shows.
 */
export function useConnectedSourceValue(nodeId: string, handleId: string): string | undefined {
  const edges = useWorkflowStore((s) => s.edges);
  const nodes = useWorkflowStore((s) => s.nodes);

  const edge = edges.find((e) => e.target === nodeId && (e.targetHandle ?? "") === handleId);
  if (!edge) return undefined;
  const sourceNode = nodes.find((n) => n.id === edge.source);
  if (!sourceNode) return undefined;
  const sourceHandle = edge.sourceHandle ?? "";

  if (sourceNode.data.kind === "request-inputs") {
    const field = sourceNode.data.fields.find((f) => f.id === sourceHandle);
    return field?.value ? String(field.value) : undefined;
  }
  if (sourceNode.data.kind === "gemini") {
    return sourceNode.data.response;
  }
  if (sourceNode.data.kind === "crop-image") {
    return sourceNode.data.outputImageUrl;
  }
  return undefined;
}

export function InputHandleRow({
  nodeId,
  handleId,
  label,
  dataType,
  required,
  tooltip,
  children,
}: {
  nodeId: string;
  handleId: string;
  label: string;
  dataType: HandleDataType;
  required?: boolean;
  tooltip?: string;
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
      <label className="mb-1 flex items-center gap-1 text-[11px] font-normal text-zinc-800">
        {label}
        {required && <span className="text-red-500">*</span>}
       
        {tooltip && <Tooltip text={tooltip} />}
        {connected && <span className="ml-auto text-[10px] font-normal text-zinc-400">connected</span>}
      </label>
      <div className={cn(connected && "pointer-events-none opacity-50")}>{children}</div>
    </div>
  );
}

/**
 * For a multi-connection image handle (e.g. Gemini's Image (Vision), which
 * accepts several edges into the same handle), resolves every connected
 * upstream node's current image URL. Returns [] gracefully if nodeId
 * doesn't match any node — lets callers pass a possibly-empty id without
 * needing to conditionally skip the hook (rules of hooks).
 */
export function useConnectedSourceImages(nodeId: string, handleId: string): string[] {
  const edges = useWorkflowStore((s) => s.edges);
  const nodes = useWorkflowStore((s) => s.nodes);

  const matchingEdges = edges.filter((e) => e.target === nodeId && (e.targetHandle ?? "") === handleId);
  const urls: string[] = [];
  for (const edge of matchingEdges) {
    const sourceNode = nodes.find((n) => n.id === edge.source);
    if (!sourceNode) continue;
    const sourceHandle = edge.sourceHandle ?? "";
    if (sourceNode.data.kind === "request-inputs") {
      const field = sourceNode.data.fields.find((f) => f.id === sourceHandle);
      if (field?.value) urls.push(String(field.value));
    } else if (sourceNode.data.kind === "crop-image") {
      if (sourceNode.data.outputImageUrl) urls.push(sourceNode.data.outputImageUrl);
    }
  }
  return urls;
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