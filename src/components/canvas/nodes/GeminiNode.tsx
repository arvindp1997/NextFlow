"use client";

import { useState } from "react";
import type { NodeProps } from "@xyflow/react";
import { Handle, Position } from "@xyflow/react";
import { ChevronDown, ChevronRight, Video, AudioLines, Paperclip, Info, RotateCcw, Upload } from "lucide-react";
import { NodeShell, CostIndicator } from "@/components/canvas/nodes/NodeShell";
import { InputHandleRow, useConnectedSourceValue, useConnectedSourceImages } from "@/components/canvas/HandleRow";
import { useWorkflowStore, type FlowNode } from "@/store/workflowStore";
import type { GeminiNodeData, HandleDataType } from "@/lib/types";
import { HANDLE_COLORS } from "@/lib/types";

type Props = NodeProps<FlowNode & { data: GeminiNodeData }>;

const DEFAULT_SETTINGS = { temperature: 1, maxOutputTokens: 2048, topP: 0.95 };

export function GeminiNode({ id, data }: Props) {
  const updateNodeData = useWorkflowStore((s) => s.updateNodeData);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const promptPreview = useConnectedSourceValue(id, "prompt");
  const systemPromptPreview = useConnectedSourceValue(id, "system_prompt");

  function resetNode() {
    updateNodeData(id, {
      prompt: undefined,
      systemPrompt: undefined,
      imageUrls: [],
      videoUrl: undefined,
      audioUrl: undefined,
      fileUrl: undefined,
      response: undefined,
      settings: DEFAULT_SETTINGS,
    });
  }

  return (
    <NodeShell
      nodeId={id}
      title={data.label}
      runStatus={data.runStatus}
      runnable
      titleSlot={
        <span title="Generates text using Gemini, optionally grounded on uploaded media" className="text-zinc-300 hover:text-zinc-500">
          <Info size={13} />
        </span>
      }
      headerExtra={
        <button
          className="rounded-md p-1 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-600"
          onClick={resetNode}
          aria-label="Reset node"
          title="Reset to defaults"
        >
          <RotateCcw size={14} />
        </button>
      }
      footer={<CostIndicator estimate="0.0001 M" />}
    >
      <InputHandleRow nodeId={id} handleId="prompt" label="Prompt" dataType="text" required tooltip="The main instruction sent to Gemini">
        <textarea
          className="w-full resize-none rounded-md border border-border bg-white px-2 py-1.5 text-xs outline-none focus:border-zinc-400"
          rows={2}
          placeholder="Enter your prompt…"
          value={promptPreview ?? data.prompt ?? ""}
          readOnly={promptPreview !== undefined}
          onChange={(e) => updateNodeData(id, { prompt: e.target.value })}
        />
      </InputHandleRow>

      <InputHandleRow nodeId={id} handleId="system_prompt" label="System Prompt" dataType="text" tooltip="Sets Gemini's role and behavior for this call">
        <textarea
          className="w-full resize-none rounded-md border border-border bg-white px-2 py-1.5 text-xs outline-none focus:border-zinc-400"
          rows={2}
          placeholder="You are a helpful assistant…"
          value={systemPromptPreview ?? data.systemPrompt ?? ""}
          readOnly={systemPromptPreview !== undefined}
          onChange={(e) => updateNodeData(id, { systemPrompt: e.target.value })}
        />
      </InputHandleRow>

      <ImageVisionRow nodeId={id} />
      <MediaInputRow nodeId={id} handleId="video" label="Video" icon={<Video size={13} />} dataType="video" />
      <MediaInputRow nodeId={id} handleId="audio" label="Audio" icon={<AudioLines size={13} />} dataType="audio" />
      <MediaInputRow nodeId={id} handleId="file" label="File" icon={<Paperclip size={13} />} dataType="file" />

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

      <div className="relative border-t border-border pt-3">
        <label className="mb-1 block text-[11px] font-normal text-zinc-800">Response</label>
        <div className="min-h-[56px] rounded-md border border-border bg-zinc-50 px-2 py-1.5 text-xs text-zinc-600">
          {data.response ? <p className="whitespace-pre-wrap">{data.response}</p> : <span className="text-zinc-400">No output yet</span>}
        </div>
        <Handle id="response" type="source" position={Position.Right} style={{ background: HANDLE_COLORS.text, right: -7 }} />
      </div>
    </NodeShell>
  );
}

function ImageVisionRow({ nodeId }: { nodeId: string }) {
  const images = useConnectedSourceImages(nodeId, "image_vision");
  return (
    <div className="relative">
      <Handle id="image_vision" type="target" position={Position.Left} style={{ background: HANDLE_COLORS.image, left: -7 }} />
      <label className="mb-1 flex items-center gap-1 text-[11px] font-normal text-zinc-800">
        Image (Vision)
        {images.length > 0 && <span className="ml-auto text-[10px] font-normal text-zinc-400">connected</span>}
      </label>
      {images.length > 0 ? (
        <div className="flex flex-wrap gap-1.5 rounded-md border border-border bg-white p-1.5">
          {images.map((url, i) => (
            // eslint-disable-next-line @next/next/no-img-element
            <img key={url + i} src={url} alt="" className="h-12 w-12 rounded object-cover" />
          ))}
        </div>
      ) : (
        <div className="flex items-center justify-center gap-1.5 rounded-lg border border-dashed border-border-strong bg-white px-2 py-2 text-xs text-zinc-400">
          <Upload size={12} />
          Upload Image
        </div>
      )}
      <div
        title="Accepts JPEG, PNG, WEBP, or GIF — multiple images can be connected at once"
        className="mt-1 flex items-center gap-1 text-[10px] text-black/70"
      >
        <Info size={10} />
        Upload requirements
      </div>
    </div>
  );
}

function MediaInputRow({
  nodeId,
  handleId,
  label,
  icon,
  dataType,
}: {
  nodeId: string;
  handleId: string;
  label: string;
  icon: React.ReactNode;
  dataType: HandleDataType;
}) {
  return (
    <InputHandleRow nodeId={nodeId} handleId={handleId} label={label} dataType={dataType}>
      <div className="flex items-center justify-center gap-1.5 rounded-lg border border-dashed border-border-strong bg-white px-2 py-2 text-xs text-zinc-400">
        {icon}
        Upload {label}
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