"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Loader2, Upload, CheckCircle2, XCircle, AlertCircle, Ban, Play, AlignLeft, ImageIcon } from "lucide-react";
import type { FlowNode, FlowEdge } from "@/store/workflowStore";
import type { RequestInputsNodeData, ResponseNodeData, RequestInputField } from "@/lib/types";
import { nodeDisplayLabel, slugifyLabel } from "@/lib/types";
import { uploadImageViaTransloadit, ACCEPTED_IMAGE_TYPES } from "@/lib/transloadit-upload";
import { formatRelativeTime } from "@/lib/utils";
import { Badge } from "@/components/ui/Badge";

interface RunRow {
  id: string;
  status: "RUNNING" | "SUCCESS" | "FAILED" | "PARTIAL" | "CANCELED";
  startedAt: string;
  durationMs?: number | null;
}

export function PlaygroundPanel({
  workflowId,
  initialNodes,
  initialEdges,
}: {
  workflowId: string;
  initialNodes: FlowNode[];
  initialEdges: FlowEdge[];
}) {
  const [nodes, setNodes] = useState(initialNodes);
  const [edges, setEdges] = useState(initialEdges);
  const requestInputsNode = nodes.find((n) => n.data.kind === "request-inputs");
  const responseNode = nodes.find((n) => n.data.kind === "response");

  const [fieldValues, setFieldValues] = useState<Record<string, string>>(() => {
    const data = requestInputsNode?.data as RequestInputsNodeData | undefined;
    const initial: Record<string, string> = {};
    for (const f of data?.fields ?? []) initial[f.id] = f.value ?? "";
    return initial;
  });
  const [uploadingFieldId, setUploadingFieldId] = useState<string | null>(null);
  const [running, setRunning] = useState(false);
  const [runs, setRuns] = useState<RunRow[]>([]);
  const [historyTab, setHistoryTab] = useState<"ui" | "api">("ui");
  const pollTimer = useRef<ReturnType<typeof setInterval> | null>(null);

  const refreshHistory = useCallback(async () => {
    try {
      const res = await fetch(`/api/workflows/${workflowId}/history`);
      if (!res.ok) return;
      const json = await res.json();
      setRuns(json.runs ?? []);
    } catch (err) {
      console.error("Failed to load run history:", err);
    }
  }, [workflowId]);

  useEffect(() => {
    refreshHistory();
  }, [refreshHistory]);

  useEffect(() => {
    return () => {
      if (pollTimer.current) clearInterval(pollTimer.current);
    };
  }, []);

  async function handleFileSelect(fieldId: string, file: File | undefined) {
    if (!file) return;
    setUploadingFieldId(fieldId);
    try {
      const url = await uploadImageViaTransloadit(file);
      setFieldValues((prev) => ({ ...prev, [fieldId]: url }));
    } catch (err) {
      console.error("Image upload failed:", err);
    } finally {
      setUploadingFieldId(null);
    }
  }

  async function handleRun() {
    if (!requestInputsNode || running) return;
    setRunning(true);
    try {
      // Write the Playground's input values onto the Request-Inputs node and
      // save, exactly like typing into that node on the canvas would — the
      // run endpoint always executes whatever's currently persisted, there's
      // no separate "ad-hoc input override" path.
      const updatedNodes = nodes.map((n) =>
        n.id === requestInputsNode.id
          ? {
              ...n,
              data: {
                ...n.data,
                fields: (n.data as RequestInputsNodeData).fields.map((f) => ({
                  ...f,
                  value: fieldValues[f.id] ?? f.value,
                })),
              },
            }
          : n
      );
      await fetch(`/api/workflows/${workflowId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nodes: updatedNodes, edges }),
      });
      setNodes(updatedNodes);

      await fetch(`/api/workflows/${workflowId}/run`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scope: "full", targetNodeIds: [] }),
      });
      refreshHistory();

      // Poll until the run finishes, then pull the fresh node data (each
      // node's own data.response / data.outputImageUrl gets updated by the
      // run) so the Output panel can render the same way ResponseNode does
      // on the canvas.
      if (pollTimer.current) clearInterval(pollTimer.current);
      pollTimer.current = setInterval(async () => {
        const res = await fetch(`/api/workflows/${workflowId}/history`);
        if (!res.ok) return;
        const json = await res.json();
        const latest = json.runs?.[0];
        setRuns(json.runs ?? []);
        if (latest && latest.status !== "RUNNING") {
          if (pollTimer.current) clearInterval(pollTimer.current);
          const wfRes = await fetch(`/api/workflows/${workflowId}`);
          if (wfRes.ok) {
            const wfJson = await wfRes.json();
            setNodes(wfJson.workflow.nodes);
            setEdges(wfJson.workflow.edges);
          }
          setRunning(false);
        }
      }, 2000);
    } catch (err) {
      console.error("Run failed:", err);
      setRunning(false);
    }
  }

  const resultEdges = responseNode ? edges.filter((e) => e.target === responseNode.id && (e.targetHandle ?? "") === "result") : [];

  return (
    <div className="flex h-full flex-col overflow-y-auto pl-6 pr-6">
    <div className="grid flex-1 grid-cols-1 gap-4 p-4 md:grid-cols-[3fr_7fr]">
         <div className="flex flex-col rounded-2xl border border-border bg-white p-4">
          <div className="mb-3 flex items-start justify-between">
            <div>
              <h2 className="text-sm font-semibold text-zinc-900">Inputs</h2>
              <p className="text-xs text-zinc-400">Configure the input fields for this workflow run</p>
            </div>
            {/* Decorative, same caveat as the Est/Bal badges in the editor header. */}
            <span className="rounded-md border border-border bg-zinc-50 px-2 py-1 text-[11px] font-medium text-zinc-500">
              Est ~0.01 M
            </span>
          </div>

          {!requestInputsNode || (requestInputsNode.data as RequestInputsNodeData).fields.length === 0 ? (
            <p className="mb-4 text-xs text-zinc-400">This workflow has no input fields defined.</p>
          ) : (
            <div className="mb-4 space-y-4">
              {(requestInputsNode.data as RequestInputsNodeData).fields.map((field) => (
                <InputField
                  key={field.id}
                  field={field}
                  value={fieldValues[field.id] ?? ""}
                  uploading={uploadingFieldId === field.id}
                  onChange={(value) => setFieldValues((prev) => ({ ...prev, [field.id]: value }))}
                  onFileSelect={(file) => handleFileSelect(field.id, file)}
                />
              ))}
            </div>
          )}

          <button
            onClick={handleRun}
            disabled={!requestInputsNode || running}
            className="mt-auto flex w-full items-center justify-center gap-2 rounded-xl bg-indigo-600 py-2.5 text-sm font-medium text-white hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {running ? <Loader2 size={15} className="animate-spin" /> : <Play size={14} fill="currentColor" />}
            {running ? "Running…" : "Run"}
          </button>
        </div>

        <div className="rounded-2xl border border-border bg-white p-4">
          <h2 className="text-sm font-semibold text-zinc-900">Output</h2>
          <p className="mb-3 text-xs text-zinc-400">Results from workflow execution</p>

          {resultEdges.length === 0 ? (
            <EmptyOutput />
          ) : (
            <div className="space-y-2.5">
              {resultEdges.map((edge) => {
                const sourceNode = nodes.find((n) => n.id === edge.source);
                if (!sourceNode) return null;
                const label =
                  (responseNode?.data as ResponseNodeData | undefined)?.resultLabels?.[edge.id] ??
                  slugifyLabel(nodeDisplayLabel(sourceNode.data));
                const value =
                  sourceNode.data.kind === "gemini"
                    ? sourceNode.data.response
                    : sourceNode.data.kind === "crop-image"
                      ? sourceNode.data.outputImageUrl
                      : undefined;
                return (
                  <div key={edge.id} className="overflow-hidden rounded-xl border border-border">
                    <div className="border-b border-border bg-zinc-50 px-2.5 py-1.5 text-[12px] font-medium text-zinc-700">
                      {label}
                    </div>
                    <div className="min-h-[44px] px-2.5 py-2 text-xs text-zinc-600">
                      {value ? (
                        sourceNode.data.kind === "crop-image" && typeof value === "string" ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={value} alt="" className="max-h-40 rounded object-contain" />
                        ) : (
                          <pre className="whitespace-pre-wrap break-words font-sans">
                            {typeof value === "string" ? value : JSON.stringify(value)}
                          </pre>
                        )
                      ) : (
                        <span className="text-zinc-400">No output yet</span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      <div className="border-t rounded-2xl border-border bg-white p-4 ml-3 mr-3 mb-3">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-zinc-900">Run History ({runs.length})</h2>
          <div className="flex items-center gap-1 rounded-lg border border-border p-0.5">
            <button
              onClick={() => setHistoryTab("ui")}
              className={`rounded-md px-2.5 py-1 text-[11px] font-medium ${historyTab === "ui" ? "bg-zinc-100 text-zinc-900" : "text-zinc-500"}`}
            >
              UI Runs
            </button>
            {/* <button
              onClick={() => setHistoryTab("api")}
              className={`rounded-md px-2.5 py-1 text-[11px] font-medium ${historyTab === "api" ? "bg-zinc-100 text-zinc-900" : "text-zinc-500"}`}
            >
              API Runs
            </button> */}
          </div>
        </div>

        <table className="w-full text-left text-xs">
          <thead>
            <tr className="border-b border-border text-zinc-400">
              <th className="pb-2 font-medium">Date &amp; Time</th>
              <th className="pb-2 font-medium">Status</th>
              <th className="pb-2 font-medium">Used credits</th>
              <th className="pb-2 text-right font-medium">Run ID</th>
            </tr>
          </thead>
          <tbody>
            {historyTab === "api" || runs.length === 0 ? (
              <tr>
                <td colSpan={4} className="py-6 text-center text-zinc-400">
                  {historyTab === "api" ? "No API runs yet." : "No UI run yet."}
                </td>
              </tr>
            ) : (
              runs.map((run) => (
                <tr key={run.id} className="border-b border-border last:border-0">
                  <td className="py-2.5 text-zinc-600">{formatRelativeTime(run.startedAt)}</td>
                  <td className="py-2.5">
                    <RunStatusBadge status={run.status} />
                  </td>
                  {/* Decorative — there's no real per-run credit accounting in the app. */}
                  <td className="py-2.5 text-zinc-400">~0.01 M</td>
                  <td className="py-2.5 text-right font-mono text-[11px] text-zinc-400">{run.id}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function InputField({
  field,
  value,
  uploading,
  onChange,
  onFileSelect,
}: {
  field: RequestInputField;
  value: string;
  uploading: boolean;
  onChange: (value: string) => void;
  onFileSelect: (file: File | undefined) => void;
}) {
  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between">
        <span className="flex items-center gap-1.5 text-[13px] font-medium text-zinc-700">
          {field.type === "text_field" ? (
            <AlignLeft size={13} className="text-zinc-400" />
          ) : (
            <ImageIcon size={13} className="text-zinc-400" />
          )}
          {field.name}
        </span>
        <span className="text-[11px] text-zinc-400">{field.type === "text_field" ? "Text" : "Image"}</span>
      </div>
      {field.type === "text_field" ? (
        <textarea
          className="w-full resize-y rounded-lg border border-border px-3 py-2 text-sm text-zinc-700 outline-none placeholder:text-zinc-400 focus:ring-1 focus:ring-zinc-300"
          rows={3}
          placeholder={`Enter ${field.name}…`}
          value={value}
          onChange={(e) => onChange(e.target.value)}
        />
      ) : (
        <label className="flex cursor-pointer items-center justify-center gap-1.5 rounded-lg border border-dashed border-border-strong px-3 py-3 text-xs text-zinc-400 hover:border-zinc-400">
          <input
            type="file"
            accept={ACCEPTED_IMAGE_TYPES}
            className="hidden"
            onChange={(e) => onFileSelect(e.target.files?.[0])}
          />
          {uploading ? (
            <span className="flex items-center gap-1.5 text-zinc-500">
              <Loader2 size={13} className="animate-spin" /> Uploading…
            </span>
          ) : value ? (
            <span className="flex min-w-0 items-center gap-2">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={value} alt="" className="h-7 w-7 rounded object-cover" />
              <span className="truncate text-zinc-600">{value.split("/").pop()}</span>
            </span>
          ) : (
            <span className="flex items-center gap-1.5 text-zinc-500">
              <Upload size={14} /> Upload Image
            </span>
          )}
        </label>
      )}
    </div>
  );
}
function EmptyOutput() {
  return (
    <div className="flex h-64 flex-col items-center justify-center gap-2 text-center">
      <Play size={28} className="text-zinc-200" />
      <p className="text-sm font-medium text-zinc-500">No output yet</p>
      <p className="text-xs text-zinc-400">Run the workflow to see results here</p>
    </div>
  );
}

function RunStatusBadge({ status }: { status: RunRow["status"] }) {
  if (status === "SUCCESS")
    return (
      <Badge tone="green">
        <CheckCircle2 size={11} /> Success
      </Badge>
    );
  if (status === "FAILED")
    return (
      <Badge tone="red">
        <XCircle size={11} /> Failed
      </Badge>
    );
  if (status === "PARTIAL")
    return (
      <Badge tone="yellow">
        <AlertCircle size={11} /> Partial
      </Badge>
    );
  if (status === "CANCELED")
    return (
      <Badge tone="gray">
        <Ban size={11} /> Canceled
      </Badge>
    );
  return (
    <Badge tone="orange">
      <Loader2 size={11} className="animate-spin" /> Running
    </Badge>
  );
}