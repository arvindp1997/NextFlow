"use client";

import { useState } from "react";
import type { NodeProps } from "@xyflow/react";
import { Plus, Type, ImageIcon, X, Upload, Loader2 } from "lucide-react";
import { NodeShell } from "@/components/canvas/nodes/NodeShell";
import { OutputHandleRow } from "@/components/canvas/HandleRow";
import { useWorkflowStore, type FlowNode } from "@/store/workflowStore";
import type { RequestInputsNodeData, RequestInputField } from "@/lib/types";
import { uid } from "@/lib/utils";
import { uploadImageViaTransloadit, ACCEPTED_IMAGE_TYPES } from "@/lib/transloadit-upload";

type Props = NodeProps<FlowNode & { data: RequestInputsNodeData }>;

export function RequestInputsNode({ id, data }: Props) {
  const updateNodeData = useWorkflowStore((s) => s.updateNodeData);
  const [picker, setPicker] = useState(false);
  const [uploadingFieldId, setUploadingFieldId] = useState<string | null>(null);

  function addField(type: "text_field" | "image_field") {
    const existingOfType = data.fields.filter((f) => f.type === type).length;
    const field: RequestInputField = {
      id: uid("field"),
      name: existingOfType > 0 ? `${type}_${existingOfType + 1}` : type,
      type,
      value: "",
    };
    updateNodeData(id, { fields: [...data.fields, field] });
    setPicker(false);
  }

  function updateField(fieldId: string, patch: Partial<RequestInputField>) {
    updateNodeData(id, { fields: data.fields.map((f) => (f.id === fieldId ? { ...f, ...patch } : f)) });
  }

  function removeField(fieldId: string) {
    updateNodeData(id, { fields: data.fields.filter((f) => f.id !== fieldId) });
  }

  async function handleFileSelect(fieldId: string, file: File | undefined) {
    if (!file) return;
    setUploadingFieldId(fieldId);
    try {
      const url = await uploadImageViaTransloadit(file);
      updateField(fieldId, { value: url });
    } catch (err) {
      console.error("Image upload failed:", err);
    } finally {
      setUploadingFieldId(null);
    }
  }

  return (
    <NodeShell nodeId={id} title="Request-Inputs" deletable={false}>
      {data.fields.length === 0 && (
        <p className="text-xs text-zinc-400">No fields yet — add a text or image input below.</p>
      )}

      {data.fields.map((field) => (
        <div key={field.id} className="rounded-lg border border-border bg-zinc-50/60 p-2">
          <div className="mb-1.5 flex items-center gap-1.5">
            {field.type === "text_field" ? (
              <Type size={12} className="text-orange-500" />
            ) : (
              <ImageIcon size={12} className="text-blue-500" />
            )}
            <input
              className="flex-1 truncate bg-transparent text-[12px] font-medium text-zinc-700 outline-none"
              value={field.name}
              onChange={(e) => updateField(field.id, { name: e.target.value })}
            />
            <button className="text-zinc-300 hover:text-red-500" onClick={() => removeField(field.id)}>
              <X size={13} />
            </button>
          </div>

          {field.type === "text_field" ? (
            <textarea
              className="w-full resize-none rounded-md border border-border bg-white px-2 py-1.5 text-xs text-zinc-700 outline-none focus:border-zinc-400"
              rows={2}
              placeholder="Enter text…"
              value={field.value ?? ""}
              onChange={(e) => updateField(field.id, { value: e.target.value })}
            />
          ) : (
            <label className="flex cursor-pointer items-center justify-between rounded-md border border-dashed border-border-strong bg-white px-2 py-1.5 text-xs text-zinc-400 hover:border-zinc-400">
              <input
                type="file"
                accept={ACCEPTED_IMAGE_TYPES}
                className="hidden"
                onChange={(e) => handleFileSelect(field.id, e.target.files?.[0])}
              />
              {uploadingFieldId === field.id ? (
                <span className="flex items-center gap-1.5 text-zinc-500">
                  <Loader2 size={12} className="animate-spin" /> Uploading…
                </span>
              ) : field.value ? (
                <span className="flex min-w-0 items-center gap-2">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={field.value} alt="" className="h-6 w-6 rounded object-cover" />
                  <span className="truncate text-zinc-600">{field.value.split("/").pop()}</span>
                </span>
              ) : (
                <span className="flex items-center gap-1">
                  <Upload size={12} /> Upload image
                </span>
              )}
            </label>
          )}

          <OutputHandleRow nodeId={id} handleId={field.id} label="" dataType={field.type === "text_field" ? "text" : "image"} />
        </div>
      ))}

      <div className="relative">
        <button
          className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-dashed border-border-strong py-1.5 text-xs font-medium text-zinc-500 hover:border-zinc-400 hover:text-zinc-700"
          onClick={() => setPicker((v) => !v)}
        >
          <Plus size={13} /> Add field
        </button>
        {picker && (
          <div className="absolute left-0 right-0 z-10 mt-1 rounded-lg border border-border bg-white py-1 shadow-lg">
            <button
              className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs text-zinc-700 hover:bg-zinc-50"
              onClick={() => addField("text_field")}
            >
              <Type size={13} className="text-orange-500" /> Text field
            </button>
            <button
              className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs text-zinc-700 hover:bg-zinc-50"
              onClick={() => addField("image_field")}
            >
              <ImageIcon size={13} className="text-blue-500" /> Image field
            </button>
          </div>
        )}
      </div>
    </NodeShell>
  );
}
