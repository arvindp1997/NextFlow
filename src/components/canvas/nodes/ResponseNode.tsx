"use client";

import type { NodeProps } from "@xyflow/react";
import { Handle, Position } from "@xyflow/react";
import { NodeShell } from "@/components/canvas/nodes/NodeShell";
import { useConnectedSourceImages } from "@/components/canvas/HandleRow";
import { useWorkflowStore, type FlowNode } from "@/store/workflowStore";
import type { ResponseNodeData } from "@/lib/types";
import { HANDLE_COLORS } from "@/lib/types";

type Props = NodeProps<FlowNode & { data: ResponseNodeData }>;

export function ResponseNode({ id, data }: Props) {
  // The Response node's own "result" handle only ever carries text (Gemini's
  // output is text-only). To also show the images that fed that Gemini call
  // — so the final deliverable reads like an actual finished post, not just
  // copy — resolve one hop further upstream: find whichever node feeds
  // "result", and if it's a Gemini node, pull the images connected to *its*
  // Image (Vision) handle.
  const edges = useWorkflowStore((s) => s.edges);
  const nodes = useWorkflowStore((s) => s.nodes);
  const sourceEdge = edges.find((e) => e.target === id && (e.targetHandle ?? "") === "result");
  const sourceNode = sourceEdge ? nodes.find((n) => n.id === sourceEdge.source) : undefined;
  const upstreamGeminiId = sourceNode?.data.kind === "gemini" ? sourceNode.id : "";
  const resultImages = useConnectedSourceImages(upstreamGeminiId, "image_vision");

  return (
    <NodeShell nodeId={id} title="Response" deletable={false} width="w-64">
      <div className="relative">
        <Handle id="result" type="target" position={Position.Left} style={{ background: HANDLE_COLORS.any, left: -7 }} />
        <label className="mb-1 block text-[11px] font-medium text-zinc-500">result</label>
        <div className="min-h-[52px] rounded-md border border-border bg-zinc-50 px-2 py-1.5 text-xs text-zinc-600">
          {data.result ? (
            <pre className="whitespace-pre-wrap break-words font-sans">
              {typeof data.result === "string" ? data.result : JSON.stringify(data.result, null, 2)}
            </pre>
          ) : (
            <span className="text-zinc-400">No output yet</span>
          )}
        </div>
        {resultImages.length > 0 && (
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {resultImages.map((url, i) => (
              // eslint-disable-next-line @next/next/no-img-element
              <img key={url + i} src={url} alt="" className="h-16 w-16 rounded-md border border-border object-cover" />
            ))}
          </div>
        )}
      </div>
    </NodeShell>
  );
}