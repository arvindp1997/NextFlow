"use client";

import { useState } from "react";
import type { NodeProps } from "@xyflow/react";
import { Plus, AlignLeft, ImageIcon, Trash2, Copy, Upload, Loader2, GripVertical, X } from "lucide-react";
import { NodeShell } from "@/components/canvas/nodes/NodeShell";
import { OutputHandleRow } from "@/components/canvas/HandleRow";
import { useWorkflowStore, type FlowNode } from "@/store/workflowStore";
import type { RequestInputsNodeData, RequestInputField } from "@/lib/types";
import { uid } from "@/lib/utils";
import { uploadImageViaTransloadit, ACCEPTED_IMAGE_TYPES } from "@/lib/transloadit-upload";
import { Tooltip } from "@/components/ui/Tooltip";

type Props = NodeProps<FlowNode & { data: RequestInputsNodeData }>;

const FIELD_TOOLTIPS: Record<RequestInputField["type"], string> = {
  text_field: "A multi-line text input value",
  image_field: "An image file uploaded by the user",
};

function AddFieldButton({ onAdd }: { onAdd: (type: "text_field" | "image_field") => void }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative">
      <button
        className="flex h-7 w-7 items-center justify-center rounded-md border border-border text-zinc-500 hover:border-zinc-400 hover:text-zinc-700"
        onClick={() => setOpen((v) => !v)}
        aria-label="Add field"
      >
        <Plus size={15} />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-full z-20 mt-1.5 w-40 rounded-xl border border-border bg-white py-1.5 shadow-lg">
            <button
              className="flex w-full items-center gap-2.5 px-3.5 py-2 text-left text-[13px] text-zinc-700 hover:bg-zinc-50"
              onClick={() => {
                onAdd("text_field");
                setOpen(false);
              }}
            >
              <AlignLeft size={15} className="text-zinc-500" /> Text
            </button>
            <button
              className="flex w-full items-center gap-2.5 px-3.5 py-2 text-left text-[13px] text-zinc-700 hover:bg-zinc-50"
              onClick={() => {
                onAdd("image_field");
                setOpen(false);
              }}
            >
              <ImageIcon size={15} className="text-zinc-500" /> Image
            </button>
          </div>
        </>
      )}
    </div>
  );
}

export function RequestInputsNode({ id, data, selected }: Props) {
  const updateNodeData = useWorkflowStore((s) => s.updateNodeData);
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
  }

  function updateField(fieldId: string, patch: Partial<RequestInputField>) {
    updateNodeData(id, { fields: data.fields.map((f) => (f.id === fieldId ? { ...f, ...patch } : f)) });
  }

  function removeField(fieldId: string) {
    updateNodeData(id, { fields: data.fields.filter((f) => f.id !== fieldId) });
  }

  async function copyFieldValue(field: RequestInputField) {
    try {
      await navigator.clipboard.writeText(field.value ? String(field.value) : "");
    } catch (err) {
      console.error("Copy to clipboard failed:", err);
    }
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
    <NodeShell
      selected={selected}
      nodeId={id}
      title="Request-Inputs"
      deletable={false}
      titleSlot={<Tooltip text={"Define the inputs your workflow accepts"} />}
      headerExtra={<AddFieldButton onAdd={addField} />}
    >
      {data.fields.length === 0 && (
        <p className="text-xs text-zinc-400">No fields yet — add a text or image input.</p>
      )}

      {data.fields.map((field) => (
        <div key={field.id}>
          <div className="mb-1.5 flex items-center gap-1.5">
            <GripVertical size={13} className="shrink-0 cursor-grab text-zinc-300" />
            <input
              className="min-w-0 flex-1 truncate bg-transparent text-[12px] font-medium text-black outline-none"
              value={field.name}
              onChange={(e) => updateField(field.id, { name: e.target.value })}
            />

            <Tooltip text={FIELD_TOOLTIPS[field.type]} />

            <button
              className="shrink-0 text-zinc-300 hover:text-zinc-600"
              onClick={() => copyFieldValue(field)}
              aria-label="Copy field value"
              title="Copy field value"
            >
              <Copy size={13} />
            </button>
            <button
              className="shrink-0 text-zinc-300 hover:text-red-500"
              onClick={() => removeField(field.id)}
              aria-label="Delete field"
              title="Delete field"
            >
              <Trash2 size={13} />
            </button>
          </div>

          {field.type === "text_field" ? (
            <textarea
              className={`w-full resize-y rounded-lg bg-zinc-100 px-2.5 py-2 text-xs text-zinc-700 outline-none placeholder:text-zinc-400 focus:ring-1 focus:ring-zinc-300 ${!field.value || field.value.trim() === "" ? "ring-1 ring-red-300" : ""}`}
              rows={2}
              placeholder="Enter text…"
              value={field.value ?? ""}
              onChange={(e) => updateField(field.id, { value: e.target.value })}
            />
          ) : (
            <label className={`relative flex cursor-pointer items-center justify-center gap-1.5 rounded-lg border border-dashed bg-white px-2 py-2.5 text-xs text-zinc-400 hover:border-zinc-400 ${!field.value ? "border-red-300" : "border-border-strong"}`}>
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
                <span className="group relative inline-flex">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={field.value}
                    alt=""
                    className="h-16 w-16 rounded object-contain border border-blue-200"
                    onError={(e) => {
                      (e.target as HTMLImageElement).style.display = "none";
                    }}
                  />
                  {/* X button — appears on hover, sits at top-right of the image */}
                  <button
                    type="button"
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      updateField(field.id, { value: "" });
                    }}
                    className="absolute -right-1.5 -top-1.5 hidden h-4 w-4 items-center justify-center rounded-full bg-zinc-800 text-white shadow group-hover:flex"
                    aria-label="Remove image"
                  >
                    <X size={9} />
                  </button>
                </span>
              ) : (
                <span className="flex items-center gap-1.5 text-zinc-500">
                  <Upload size={13} /> Upload Image
                </span>
              )}
            </label>
          )}

          <OutputHandleRow nodeId={id} handleId={field.id} label="" dataType={field.type === "text_field" ? "text" : "image"} />
        </div>
      ))}
    </NodeShell>
  );
}