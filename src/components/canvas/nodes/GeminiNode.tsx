"use client";

import { useState } from "react";
import type { NodeProps } from "@xyflow/react";
import { Handle, Position } from "@xyflow/react";
import { ChevronDown, ChevronRight, Image as ImageIcon, Video, AudioLines, Paperclip } from "lucide-react";
import { NodeShell } from "@/components/canvas/nodes/NodeShell";
import { InputHandleRow, useConnectedSourceValue } from "@/components/canvas/HandleRow";
import { useWorkflowStore, type FlowNode } from "@/store/workflowStore";
import type { GeminiNodeData, GeminiModel } from "@/lib/types";
import { HANDLE_COLORS } from "@/lib/types";

type Props = NodeProps<FlowNode & { data: GeminiNodeData }>;

const MODELS: { value: GeminiModel; label: string }[] = [
  { value: "gemini-3.1-pro", label: "Gemini 3.1 Pro" },
  { value: "gemini-2.5-pro", label: "Gemini 2.5 Pro" },
  { value: "gemini-2.5-flash", label: "Gemini 2.5 Flash" },
];

export function GeminiNode({ id, data }: Props) {
  const updateNodeData = useWorkflowStore((s) => s.updateNodeData);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const promptPreview = useConnectedSourceValue(id, "prompt");
  const systemPromptPreview = useConnectedSourceValue(id, "system_prompt");

  return (
    <NodeShell
      nodeId={id}
      title={data.label}
      runStatus={data.runStatus}
      runnable
      titleSlot={
        <select
          className="rounded-md border border-border bg-zinc-50 px-1.5 py-0.5 text-[11px] font-medium text-zinc-600 outline-none"
          value={data.model}
          onChange={(e) => updateNodeData(id, { model: e.target.value as GeminiModel })}
        >
          {MODELS.map((m) => (
            <option key={m.value} value={m.value}>
              {m.label}
            </option>
          ))}
        </select>
      }
    >
      <InputHandleRow nodeId={id} handleId="prompt" label="Prompt" dataType="text" required>
        <textarea
          className="w-full resize-none rounded-md border border-border bg-white px-2 py-1.5 text-xs outline-none focus:border-zinc-400"
          rows={2}
          placeholder="Enter your prompt…"
          value={promptPreview ?? data.prompt ?? ""}
          readOnly={promptPreview !== undefined}
          onChange={(e) => updateNodeData(id, { prompt: e.target.value })}
        />
      </InputHandleRow>

      <InputHandleRow nodeId={id} handleId="system_prompt" label="System Prompt" dataType="text">
        <textarea
          className="w-full resize-none rounded-md border border-border bg-white px-2 py-1.5 text-xs outline-none focus:border-zinc-400"
          rows={2}
          placeholder="You are a helpful assistant…"
          value={systemPromptPreview ?? data.systemPrompt ?? ""}
          readOnly={systemPromptPreview !== undefined}
          onChange={(e) => updateNodeData(id, { systemPrompt: e.target.value })}
        />
      </InputHandleRow>

      <MediaInputRow nodeId={id} handleId="image_vision" label="Image (Vision)" icon={<ImageIcon size={12} />} note="accepts multiple connections" />
      <MediaInputRow nodeId={id} handleId="video" label="Video" icon={<Video size={12} />} />
      <MediaInputRow nodeId={id} handleId="audio" label="Audio" icon={<AudioLines size={12} />} />
      <MediaInputRow nodeId={id} handleId="file" label="File" icon={<Paperclip size={12} />} />

      <div>
        <button
          className="flex items-center gap-1 text-[11px] font-medium text-zinc-500 hover:text-zinc-700"
          onClick={() => setSettingsOpen((v) => !v)}
        >
          {settingsOpen ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
          Settings
        </button>
        {settingsOpen && (
          <div className="mt-2 space-y-2 rounded-md border border-border bg-zinc-50/60 p-2">
            <SettingSlider
              label="Temperature"
              value={data.settings.temperature}
              max={2}
              step={0.1}
              onChange={(v) => updateNodeData(id, { settings: { ...data.settings, temperature: v } })}
            />
            <SettingSlider
              label="Top P"
              value={data.settings.topP}
              max={1}
              step={0.05}
              onChange={(v) => updateNodeData(id, { settings: { ...data.settings, topP: v } })}
            />
            <label className="block text-[11px] font-medium text-zinc-500">
              Max Output Tokens
              <input
                type="number"
                className="mt-1 w-full rounded-md border border-border bg-white px-2 py-1 text-xs outline-none"
                value={data.settings.maxOutputTokens}
                onChange={(e) => updateNodeData(id, { settings: { ...data.settings, maxOutputTokens: Number(e.target.value) } })}
              />
            </label>
          </div>
        )}
      </div>

      <div className="relative">
        <label className="mb-1 block text-[11px] font-medium text-zinc-500">Response</label>
        <div className="min-h-[56px] rounded-md border border-border bg-zinc-50 px-2 py-1.5 text-xs text-zinc-600">
          {data.response ? <p className="whitespace-pre-wrap">{data.response}</p> : <span className="text-zinc-400">No output yet</span>}
        </div>
        <Handle id="response" type="source" position={Position.Right} style={{ background: HANDLE_COLORS.text, right: -7 }} />
      </div>
    </NodeShell>
  );
}

function MediaInputRow({
  nodeId,
  handleId,
  label,
  icon,
  note,
}: {
  nodeId: string;
  handleId: string;
  label: string;
  icon: React.ReactNode;
  note?: string;
}) {
  const dataType = handleId === "image_vision" ? "image" : handleId === "video" ? "video" : handleId === "audio" ? "audio" : "file";
  return (
    <InputHandleRow nodeId={nodeId} handleId={handleId} label={label} dataType={dataType}>
      <div className="flex items-center gap-1.5 rounded-md border border-dashed border-border-strong bg-white px-2 py-1.5 text-xs text-zinc-400">
        {icon}
        Upload {label.split(" ")[0]}
        {note && <span className="ml-auto text-[10px] text-zinc-300">{note}</span>}
      </div>
    </InputHandleRow>
  );
}

function SettingSlider({
  label,
  value,
  max,
  step,
  onChange,
}: {
  label: string;
  value: number;
  max: number;
  step: number;
  onChange: (v: number) => void;
}) {
  return (
    <label className="block text-[11px] font-medium text-zinc-500">
      <span className="flex justify-between">
        {label} <span className="text-zinc-400">{value}</span>
      </span>
      <input type="range" min={0} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} className="mt-1 w-full accent-orange-500" />
    </label>
  );
}