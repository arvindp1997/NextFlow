"use client";

import { BaseEdge, getBezierPath, type EdgeProps } from "@xyflow/react";
import { useWorkflowStore, handleType } from "@/store/workflowStore";
import { HANDLE_COLORS } from "@/lib/types";

const FALLBACK_COLOR = "#94a3b8";

/**
 * Registered as the "default" edge renderer in WorkflowCanvas, so every edge
 * — newly drawn, loaded from the DB, from the sample workflow, or imported —
 * automatically picks up the right color with no per-edge data needed. Color
 * is derived from the connected handle's data type (the same HANDLE_COLORS
 * map used for the little connector dots), not a fixed value, matching the
 * reference UI where text/image/video/audio connections each have their own
 * distinct edge color.
 */
export function TypedEdge({
  id,
  source,
  sourceHandleId,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  style,
  markerEnd,
}: EdgeProps) {
  const nodes = useWorkflowStore((s) => s.nodes);
  const type = handleType(source, sourceHandleId, nodes, "source");
  const color = (type && HANDLE_COLORS[type]) || FALLBACK_COLOR;

  const [edgePath] = getBezierPath({ sourceX, sourceY, sourcePosition, targetX, targetY, targetPosition });

  return (
    <BaseEdge id={id} path={edgePath} markerEnd={markerEnd} style={{ ...style, stroke: color, strokeWidth: 2 }} />
  );
}