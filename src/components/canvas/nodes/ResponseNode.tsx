"use client";

import { useState } from "react";
import type { NodeProps } from "@xyflow/react";
import { Handle, Position } from "@xyflow/react";
import { CornerDownLeft, Pencil, Trash2 } from "lucide-react";
import { useConnectedSourceImages } from "@/components/canvas/HandleRow";
import { useWorkflowStore, type FlowNode } from "@/store/workflowStore";
import type { ResponseNodeData } from "@/lib/types";
import { HANDLE_COLORS, nodeDisplayLabel, slugifyLabel } from "@/lib/types";
import { Tooltip } from "@/components/ui/Tooltip";

type Props = NodeProps<FlowNode & { data: ResponseNodeData }>;

export function ResponseNode({ id, data, selected }: Props) {
  const edges = useWorkflowStore((s) => s.edges);
  const updateNodeData = useWorkflowStore((s) => s.updateNodeData);
  const deleteEdge = useWorkflowStore((s) => s.deleteEdge);

  const resultEdges = edges.filter((e) => e.target === id && (e.targetHandle ?? "") === "result");

  return (
    <div className={`w-64 rounded-2xl  bg-white shadow-card ${selected ? 'border-2 border-indigo-500' : 'border border-border'}`}>
      <div className="flex items-center gap-2 border-b border-border px-3 py-2.5">
        <span className="flex h-6 w-6 items-center justify-center rounded-md bg-indigo-50 text-indigo-500">
          <CornerDownLeft size={13} />
        </span>
        <span className="text-[13px] font-semibold text-zinc-800">Response</span>
         <Tooltip text={"The final output collected from your workflow"} />
      </div>

      <div className="space-y-2.5 px-3 py-3">
        <div className="relative flex items-center gap-1.5">
          <Handle id="result" type="target" position={Position.Left} style={{ background: HANDLE_COLORS.any, left: -7 }} />
          <span className="text-[12px] font-medium text-black/70">result</span>
        </div>

        {resultEdges.length === 0 && <p className="text-xs text-zinc-400">No connections yet</p>}

        {resultEdges.map((edge) => (
          <ResultCard
            key={edge.id}
            edgeId={edge.id}
            sourceNodeId={edge.source}
            customLabel={data.resultLabels?.[edge.id]}
            onRename={(label) => updateNodeData(id, { resultLabels: { ...data.resultLabels, [edge.id]: label } })}
            onDelete={() => deleteEdge(edge.id)}
          />
        ))}
      </div>
    </div>
  );
}

function ResultCard({
  sourceNodeId,
  customLabel,
  onRename,
  onDelete,
}: {
  edgeId: string;
  sourceNodeId: string;
  customLabel?: string;
  onRename: (label: string) => void;
  onDelete: () => void;
}) {
  const sourceNode = useWorkflowStore((s) => s.nodes.find((n) => n.id === sourceNodeId));
  const resultImages = useConnectedSourceImages(sourceNode?.data.kind === "gemini" ? sourceNodeId : "", "image_vision");
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");

  if (!sourceNode) return null;

  const autoLabel = slugifyLabel(nodeDisplayLabel(sourceNode.data));
  const label = customLabel ?? autoLabel;

  const value =
    sourceNode.data.kind === "gemini"
      ? sourceNode.data.response
      : sourceNode.data.kind === "crop-image"
        ? sourceNode.data.outputImageUrl
        : sourceNode.data.kind === "request-inputs"
          ? undefined
          : undefined;

  return (
    <div className="overflow-hidden rounded-xl border border-border">
      <div className="flex items-center gap-1.5 border-b border-border bg-zinc-50 px-2.5 py-1.5">
        {editing ? (
          <input
            autoFocus
            className="min-w-0 flex-1 rounded border border-border bg-white px-1.5 py-0.5 text-[12px] text-zinc-700 outline-none"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={() => {
              if (draft.trim()) onRename(draft.trim());
              setEditing(false);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") (e.target as HTMLInputElement).blur();
              if (e.key === "Escape") setEditing(false);
            }}
          />
        ) : (
          <span className="min-w-0 flex-1 truncate text-[12px] font-medium text-zinc-700">{label}</span>
        )}
        <button
          className="shrink-0 text-zinc-400 hover:text-zinc-600"
          onClick={() => {
            setDraft(label);
            setEditing(true);
          }}
          aria-label="Rename"
          title="Rename"
        >
          <Pencil size={12} />
        </button>
        <button className="shrink-0 text-zinc-400 hover:text-red-500" onClick={onDelete} aria-label="Remove connection" title="Remove connection">
          <Trash2 size={12} />
        </button>
      </div>

      <div className="min-h-[44px] px-2.5 py-2 text-xs text-zinc-600">
        {value ? (
          sourceNode.data.kind === "crop-image" && typeof value === "string" ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={value} alt="" className="max-h-32 rounded object-contain" />
          ) : (
            <pre className="whitespace-pre-wrap break-words font-sans">{typeof value === "string" ? value : JSON.stringify(value)}</pre>
          )
        ) : (
          <span className="text-zinc-400">No output yet</span>
        )}
        {resultImages.length > 0 && (
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {resultImages.map((url, i) => (
              // eslint-disable-next-line @next/next/no-img-element
              <img key={url + i} src={url} alt="" className="h-14 w-14 rounded-md border border-border object-cover" />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}