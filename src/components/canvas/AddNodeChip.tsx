"use client";

import { Copy } from "lucide-react";
import { NodePicker } from "@/components/canvas/NodePicker";
import { useWorkflowStore } from "@/store/workflowStore";
import { cn } from "@/lib/utils";

export function AddNodeChip({ getDropPosition }: { getDropPosition: () => { x: number; y: number } }) {
  const duplicateNode = useWorkflowStore((s) => s.duplicateNode);
  const selectedNodeIds = useWorkflowStore((s) => s.selectedNodeIds);
  const canDuplicate = selectedNodeIds.length === 1;

  return (
    <div className="absolute bottom-6 left-1/2 z-20 flex -translate-x-1/2 items-center gap-0.5 rounded-xl border border-border bg-white px-1.5 py-1.5 shadow-lg">
      <button
        onClick={() => {
          const targetId = selectedNodeIds[0];
          if (canDuplicate && targetId) duplicateNode(targetId);
        }}
        disabled={!canDuplicate}
        aria-label="Duplicate selected node"
        title="Duplicate selected node"
        className={cn(
          "flex h-8 w-8 items-center justify-center rounded-full transition-colors",
          canDuplicate ? "text-zinc-500 hover:bg-zinc-100 hover:text-zinc-700" : "cursor-not-allowed text-zinc-300"
        )}
      >
        <Copy size={15} />
      </button>
      <NodePicker getDropPosition={getDropPosition} />
    </div>
  );
}