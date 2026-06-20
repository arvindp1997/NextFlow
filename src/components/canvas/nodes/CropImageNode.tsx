"use client";

import { useState } from "react";
import type { NodeProps } from "@xyflow/react";
import { Handle, Position } from "@xyflow/react";
import { ImageIcon, Loader2, Upload } from "lucide-react";
import { NodeShell, CostIndicator } from "@/components/canvas/nodes/NodeShell";
import { useIsHandleConnected, useConnectedSourceValue } from "@/components/canvas/HandleRow";
import { useWorkflowStore, type FlowNode } from "@/store/workflowStore";
import type { CropImageNodeData } from "@/lib/types";
import { HANDLE_COLORS, PERCENT_HANDLE_COLOR } from "@/lib/types";
import { cn } from "@/lib/utils";
import { uploadImageViaTransloadit, ACCEPTED_IMAGE_TYPES } from "@/lib/transloadit-upload";
import { Tooltip } from "@/components/ui/Tooltip";

type Props = NodeProps<FlowNode & { data: CropImageNodeData }>;

const DIMENSION_FIELDS: Array<{ key: keyof CropImageNodeData; handle: string; label: string; tooltip: string }> = [
  { key: "xPercent", handle: "x_percent", label: "X Position (%)", tooltip: "Horizontal offset of the crop area" },
  { key: "yPercent", handle: "y_percent", label: "Y Position (%)", tooltip: "Vertical offset of the crop area" },
  { key: "widthPercent", handle: "width_percent", label: "Width (%)", tooltip: "Width of the crop area" },
  { key: "heightPercent", handle: "height_percent", label: "Height (%)", tooltip: "Height of the crop area" },
];

export function CropImageNode({ id, data, selected }: Props) {
  const updateNodeData = useWorkflowStore((s) => s.updateNodeData);
  const inputConnected = useIsHandleConnected(id, "input_image", "target");
  const connectedImagePreview = useConnectedSourceValue(id, "input_image");
  const [uploading, setUploading] = useState(false);

  async function handleUpload(file: File | undefined) {
    if (!file) return;
    setUploading(true);
    try {
      const url = await uploadImageViaTransloadit(file);
      updateNodeData(id, { inputImageUrl: url });
    } catch (err) {
      console.error("Image upload failed:", err);
    } finally {
      setUploading(false);
    }
  }

  return (
    <NodeShell
      selected={selected}
      nodeId={id}
      title={data.label}
      runStatus={data.runStatus}
      runnable
      titleSlot={
         <Tooltip text={"Crops an image to a percentage-based region"} />
      }
      footer={<CostIndicator estimate="0.005 M" />}
    >
      <div className="relative">
        <Handle id="input_image" type="target" position={Position.Left} style={{ background: HANDLE_COLORS.image, left: -7 }} />
        <label className="mb-1 flex items-center gap-1 text-[11px] font-medium text-zinc-500">
          Input Image <span className="text-red-500">*</span>
        </label>
        <label
          className={cn(
            "flex cursor-pointer items-center justify-center gap-1.5 rounded-lg border border-dashed border-border-strong bg-white px-2 py-2.5 text-xs text-zinc-400 hover:border-zinc-400",
            inputConnected && "pointer-events-none opacity-50"
          )}
        >
          <input type="file" accept={ACCEPTED_IMAGE_TYPES} className="hidden" onChange={(e) => handleUpload(e.target.files?.[0])} />
          {uploading ? (
            <span className="flex items-center gap-1.5">
              <Loader2 size={12} className="animate-spin" /> Uploading…
            </span>
          ) : (connectedImagePreview ?? data.inputImageUrl) ? (
            <span className="flex items-center gap-1.5">
              <ImageIcon size={12} /> {(connectedImagePreview ?? data.inputImageUrl)!.split("/").pop()}
            </span>
          ) : (
            <span className="flex items-center gap-1.5 text-zinc-500">
              <Upload size={13} /> Upload Image
            </span>
          )}
        </label>
      </div>

      {DIMENSION_FIELDS.map((f) => (
        <DimensionRow key={f.handle} nodeId={id} field={f} value={data[f.key] as number} onChange={(v) => updateNodeData(id, { [f.key]: v })} />
      ))}

      <div className="relative border-t border-border pt-3">
        <label className="mb-1 block text-[11px] font-medium text-zinc-500">Output Image</label>
        <div className="flex items-center justify-center rounded-lg border border-border bg-zinc-50 px-2 py-3 text-xs text-zinc-400">
          {data.outputImageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={data.outputImageUrl} alt="" className="max-h-24 rounded object-contain" />
          ) : (
            "No output yet"
          )}
        </div>
        <Handle id="output_image" type="source" position={Position.Right} style={{ background: HANDLE_COLORS.image, right: -7 }} />
      </div>
    </NodeShell>
  );
}

function DimensionRow({
  nodeId,
  field,
  value,
  onChange,
}: {
  nodeId: string;
  field: { handle: string; label: string; tooltip: string };
  value: number;
  onChange: (v: number) => void;
}) {
  const connected = useIsHandleConnected(nodeId, field.handle, "target");
  return (
    <div className="relative">
      <Handle id={field.handle} type="target" position={Position.Left} style={{ background: PERCENT_HANDLE_COLOR, left: -7 }} />
      <label className="mb-1 flex items-center gap-1 text-[11px] font-medium text-pink-600">
        {field.label}
       
        {field.tooltip && <Tooltip text={field.tooltip} />}
        
      </label>
      <div className="flex items-center gap-2">
        <input
          type="range"
          min={0}
          max={100}
          value={value}
          disabled={connected}
          onChange={(e) => onChange(Number(e.target.value))}
          className={cn("h-1.5 flex-1 accent-indigo-500", connected && "opacity-50")}
        />
        <input
          type="number"
          min={0}
          max={100}
          value={value}
          disabled={connected}
          onChange={(e) => onChange(Math.min(100, Math.max(0, Number(e.target.value))))}
          className={cn(
            "w-12 shrink-0 rounded-md border border-border bg-zinc-50 px-1.5 py-1 text-center text-xs text-zinc-700 outline-none focus:border-zinc-400",
            connected && "opacity-50"
          )}
        />
      </div>
    </div>
  );
}