"use client";

import type { NodeProps } from "@xyflow/react";
import { Handle, Position } from "@xyflow/react";
import { NodeShell } from "@/components/canvas/nodes/NodeShell";
import type { FlowNode } from "@/store/workflowStore";
import type { ResponseNodeData } from "@/lib/types";
import { HANDLE_COLORS } from "@/lib/types";

type Props = NodeProps<FlowNode & { data: ResponseNodeData }>;

export function ResponseNode({ id, data }: Props) {
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
      </div>
    </NodeShell>
  );
}
