"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Loader2,
  Upload,
  CheckCircle2,
  XCircle,
  AlertCircle,
  Ban,
  Play,
  AlignLeft,
  ImageIcon,
  X,
  Search,
} from "lucide-react";
import type { FlowNode, FlowEdge } from "@/store/workflowStore";
import type {
  RequestInputsNodeData,
  ResponseNodeData,
  RequestInputField,
} from "@/lib/types";
import { nodeDisplayLabel, slugifyLabel } from "@/lib/types";
import {
  uploadImageViaTransloadit,
  ACCEPTED_IMAGE_TYPES,
} from "@/lib/transloadit-upload";
import { formatRelativeTime } from "@/lib/utils";
import { Badge } from "@/components/ui/Badge";
import type { NodeRunRecord } from "@/components/canvas/HistoryPanel";
import { ChevronDown } from "lucide-react";

interface RunRow {
  id: string;
  status: "RUNNING" | "SUCCESS" | "FAILED" | "PARTIAL" | "CANCELED";
  startedAt: string;
  durationMs?: number | null;
  nodeRuns: NodeRunRecord[];
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
  const [runSearch, setRunSearch] = useState("");
  const pollTimer = useRef<ReturnType<typeof setInterval> | null>(null);

  // Disable Run button if the local run state is active OR if the latest run
  // in history is still RUNNING (e.g. started from the canvas editor tab).
  const isRunning = running || runs[0]?.status === "RUNNING";

  const filteredRuns = useMemo(() => {
    const searchTerm = runSearch.trim().toLowerCase();
    if (!searchTerm) return runs;
    return runs.filter((r) => r.id.toLowerCase().includes(searchTerm));
  }, [runs, runSearch]);

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
    if (!requestInputsNode || isRunning) return;
    setRunning(true);
    try {
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
          : n,
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

  const resultEdges = responseNode
    ? edges.filter(
        (e) =>
          e.target === responseNode.id && (e.targetHandle ?? "") === "result",
      )
    : [];

  return (
    <div className="flex h-full flex-col overflow-y-auto pl-10 pr-10">
      <div className="grid h-[800px] shrink-0 grid-cols-1 gap-4 p-4 md:grid-cols-[3fr_7fr]" style={{ gridAutoRows: '1fr' }}>
        <div className="flex min-h-0 flex-col overflow-hidden rounded-2xl border border-border bg-white p-4">
          <div className="mb-3 flex items-start justify-between">
            <div>
              <h2 className="text-sm font-semibold text-zinc-900">Inputs</h2>
              <p className="text-xs text-zinc-600">
                Configure the input fields for this workflow run
              </p>
            </div>
            <span className="rounded-md border border-border bg-zinc-50 px-2 py-1 text-[11px] font-medium text-zinc-500">
              Est ~0.01 M
            </span>
          </div>
          <hr className="mb-4 w-full border-border" />

          {!requestInputsNode ||
          (requestInputsNode.data as RequestInputsNodeData).fields.length ===
            0 ? (
            <p className="mb-4 text-xs text-zinc-400">
              This workflow has no input fields defined.
            </p>
          ) : (
            <div className="mb-4 flex-1 overflow-y-auto space-y-4">
              {(requestInputsNode.data as RequestInputsNodeData).fields.map(
                (field) => (
                  <InputField
                    key={field.id}
                    field={field}
                    value={fieldValues[field.id] ?? ""}
                    uploading={uploadingFieldId === field.id}
                    onChange={(value) =>
                      setFieldValues((prev) => ({ ...prev, [field.id]: value }))
                    }
                    onFileSelect={(file) => handleFileSelect(field.id, file)}
                  />
                ),
              )}
            </div>
          )}

          <button
            onClick={handleRun}
            disabled={!requestInputsNode || isRunning}
            className="mt-auto flex w-full items-center justify-center gap-2 rounded-xl bg-indigo-600 py-2.5 text-sm font-medium text-white hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isRunning ? (
              <Loader2 size={15} className="animate-spin" />
            ) : (
              <Play size={14} fill="currentColor" />
            )}
            {isRunning ? "Running…" : "Run"}
          </button>
        </div>

        <div className="flex min-h-0 flex-col overflow-hidden rounded-2xl border border-border bg-white p-4">
          <h2 className="text-sm font-semibold text-zinc-900">Output</h2>
          <p className="mb-3 text-xs text-zinc-400">
            Results from workflow execution
          </p>
          <hr className="mb-4 w-full border-border" />

          <div className="flex-1 overflow-y-auto">
          {resultEdges.length === 0 ? (
            <EmptyOutput />
          ) : (
            <div className="space-y-2.5">
              {resultEdges.map((edge) => {
                const sourceNode = nodes.find((n) => n.id === edge.source);
                if (!sourceNode) return null;
                const label =
                  (responseNode?.data as ResponseNodeData | undefined)
                    ?.resultLabels?.[edge.id] ??
                  slugifyLabel(nodeDisplayLabel(sourceNode.data));
                const value =
                  sourceNode.data.kind === "gemini"
                    ? sourceNode.data.response
                    : sourceNode.data.kind === "crop-image"
                      ? sourceNode.data.outputImageUrl
                      : undefined;

                const sourceImages: string[] =
                  sourceNode.data.kind === "gemini"
                    ? edges
                        .filter(
                          (e) =>
                            e.target === sourceNode.id &&
                            (e.targetHandle ?? "") === "image_vision",
                        )
                        .flatMap((e) => {
                          const imgSrc = nodes.find((n) => n.id === e.source);
                          if (!imgSrc) return [];
                          if (imgSrc.data.kind === "crop-image" && imgSrc.data.outputImageUrl)
                            return [imgSrc.data.outputImageUrl];
                          if (imgSrc.data.kind === "request-inputs") {
                            const field = imgSrc.data.fields.find(
                              (f) => f.id === (e.sourceHandle ?? ""),
                            );
                            return field?.value ? [String(field.value)] : [];
                          }
                          return [];
                        })
                    : [];

                return (
                  <div
                    key={edge.id}
                    className="overflow-hidden rounded-xl border border-border"
                  >
                    <div className="border-b border-border bg-zinc-50 px-2.5 py-1.5 text-[12px] font-medium text-zinc-700">
                      {label}
                    </div>
                    <div className="min-h-[44px] px-2.5 py-2 text-xs text-zinc-600">
                      {sourceImages.length > 0 && (
                        <div className="mb-2 flex flex-row gap-1.5">
                          {sourceImages.map((url, i) => (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              key={url + i}
                              src={url}
                              alt=""
                              className="max-h-20 w-full rounded-md border border-border object-contain"
                              onError={(e) => {
                                (e.target as HTMLImageElement).style.display = "none";
                              }}
                            />
                          ))}
                        </div>
                      )}
                      {value ? (
                        sourceNode.data.kind === "crop-image" &&
                        typeof value === "string" ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={value}
                            alt=""
                            className="max-h-36 w-full rounded object-contain"
                            onError={(e) => {
                              (e.target as HTMLImageElement).style.display = "none";
                            }}
                          />
                        ) : (
                          <pre className="whitespace-pre-wrap break-words font-sans">
                            {typeof value === "string"
                              ? value
                              : JSON.stringify(value)}
                          </pre>
                        )
                      ) : (
                        sourceImages.length === 0 && (
                          <span className="text-zinc-400">No output yet</span>
                        )
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
          </div>
        </div>
      </div>

      <div className="border rounded-2xl border-border bg-white p-4 ml-3 mr-3 mb-3 shrink-0">
        <div className="mb-3 flex items-center justify-between gap-3">
          <h2 className="text-sm font-semibold text-zinc-900 shrink-0">
            Run History ({runs.length})
          </h2>
          <div className="flex items-center gap-2 ml-auto">
            <div className="flex items-center gap-1 rounded-lg border border-border p-0.5">
              <button
                onClick={() => setHistoryTab("ui")}
                className={`rounded-md px-2.5 py-1 text-[11px] font-medium ${historyTab === "ui" ? "bg-zinc-100 text-zinc-900" : "text-zinc-500"}`}
              >
                UI Runs
              </button>
            </div>
            <div className="relative">
              <Search size={12} className="absolute left-2 top-1/2 -translate-y-1/2 text-zinc-400 pointer-events-none" />
              <input
                type="text"
                placeholder="Search by Run ID…"
                value={runSearch}
                onChange={(e) => setRunSearch(e.target.value)}
                className="h-7 w-44 rounded-lg border border-border bg-zinc-50 pl-6 pr-2.5 text-[11px] text-zinc-700 outline-none placeholder:text-zinc-400 focus:border-zinc-300 focus:bg-white focus:ring-1 focus:ring-zinc-200"
              />
              {runSearch && (
                <button
                  onClick={() => setRunSearch("")}
                  className="absolute right-1.5 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-600"
                >
                  <X size={10} />
                </button>
              )}
            </div>
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
            ) : filteredRuns.length === 0 ? (
              <tr>
                <td colSpan={4} className="py-6 text-center text-zinc-400">
                  No runs match &quot;{runSearch}&quot;
                </td>
              </tr>
            ) : (
              filteredRuns.map((run) => (
                <PlaygroundRunRow key={run.id} run={run} />
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function isImageUrl(value: unknown): value is string {
  if (typeof value !== "string") return false;
  return (
    /^https?:\/\/.+\.(jpg|jpeg|png|gif|webp|svg)(\?.*)?$/i.test(value) ||
    value.includes("transloadit.com") ||
    value.includes("tlcdn.com")
  );
}

function DataDisplay({ data }: { data: Record<string, unknown> | unknown }) {
  if (typeof data !== "object" || data === null) {
    return <code className="break-all">{String(data)}</code>;
  }
  const entries = Object.entries(data as Record<string, unknown>);
  if (entries.length === 0) return null;
  return (
    <div className="mt-1 space-y-1">
      {entries.map(([key, val]) => (
        <div key={key}>
          <span className="text-zinc-400">{key}: </span>
          {Array.isArray(val) && val.length > 0 && val.every((v) => isImageUrl(v)) ? (
            <div className="mt-1 flex flex-col gap-1">
              {val.map((url: string, i: number) => (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  key={url + i}
                  src={url}
                  alt=""
                  className="max-h-24 w-full rounded border border-border object-contain"
                  onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
                />
              ))}
            </div>
          ) : isImageUrl(val) ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={val}
              alt={key}
              className="mt-1 max-h-24 rounded border border-border object-contain"
              onError={(e) => {
                (e.target as HTMLImageElement).style.display = "none";
              }}
            />
          ) : typeof val === "string" && val.length > 120 ? (
            <pre className="mt-0.5 max-h-24 overflow-y-auto whitespace-pre-wrap break-words font-sans text-[10px]">
              {val}
            </pre>
          ) : (
            <code className="break-all">{JSON.stringify(val)}</code>
          )}
        </div>
      ))}
    </div>
  );
}

function NodeStatusDot({ status }: { status: NodeRunRecord["status"] }) {
  const colours: Record<NodeRunRecord["status"], string> = {
    SUCCESS: "bg-green-500",
    FAILED: "bg-red-500",
    RUNNING: "bg-purple-500 animate-pulse",
    PENDING: "bg-zinc-300",
    SKIPPED: "bg-zinc-300",
  };
  return <span className={`inline-block h-1.5 w-1.5 rounded-full shrink-0 ${colours[status]}`} />;
}

function PlaygroundNodeRow({ nodeRun }: { nodeRun: NodeRunRecord }) {
  const [open, setOpen] = useState(false);
  const hasDetails =
    Object.keys(nodeRun.inputs ?? {}).length > 0 ||
    (nodeRun.output !== null &&
      nodeRun.output !== undefined &&
      Object.keys(nodeRun.output as object).length > 0) ||
    !!nodeRun.error;

  return (
    <div className="overflow-hidden rounded-lg border border-border bg-zinc-50">
      <button
        className="flex w-full items-center justify-between px-2.5 py-1.5 text-left transition-colors hover:bg-zinc-100"
        onClick={() => setOpen((v) => !v)}
      >
        <span className="flex items-center gap-2 text-[11px] text-zinc-700">
          <NodeStatusDot status={nodeRun.status} />
          {nodeRun.nodeLabel}
        </span>
        <span className="flex items-center gap-1.5">
          <span className="text-[10px] text-zinc-400 capitalize">{nodeRun.status.toLowerCase()}</span>
          {hasDetails && (
            <ChevronDown
              size={10}
              className={`shrink-0 text-zinc-400 transition-transform ${open ? "rotate-180" : ""}`}
            />
          )}
        </span>
      </button>
      {open && hasDetails && (
        <div className="space-y-1.5 border-t border-border px-2.5 pb-2 pt-1.5 text-[11px] text-zinc-500">
          {Object.keys(nodeRun.inputs ?? {}).length > 0 && (
            <div>
              <span className="font-medium text-zinc-600">Inputs: </span>
              <DataDisplay data={nodeRun.inputs} />
            </div>
          )}
          {nodeRun.output !== null &&
            nodeRun.output !== undefined &&
            Object.keys(nodeRun.output as object).length > 0 && (
              <div>
                <span className="font-medium text-zinc-600">Output: </span>
                <DataDisplay data={nodeRun.output as Record<string, unknown>} />
              </div>
            )}
          {nodeRun.error && (
            <div className="rounded-md bg-red-50 px-2 py-1.5 text-red-600">
              <span className="font-medium">Error: </span>
              {nodeRun.error}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function PlaygroundRunRow({ run }: { run: RunRow }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <tr
        className="cursor-pointer border-b border-border last:border-0 hover:bg-zinc-50 transition-colors"
        onClick={() => setOpen((v) => !v)}
      >
        <td className="py-2.5 text-zinc-600">{formatRelativeTime(run.startedAt)}</td>
        <td className="py-2.5">
          <RunStatusBadge status={run.status} />
        </td>
        <td className="py-2.5 text-zinc-400">~0.01 M</td>
        <td className="py-2.5 text-right">
          <span className="flex items-center justify-end gap-1.5">
            <span className="font-mono text-[11px] text-zinc-400">{run.id}</span>
            {run.nodeRuns.length > 0 && (
              <ChevronDown
                size={11}
                className={`shrink-0 text-zinc-400 transition-transform ${open ? "rotate-180" : ""}`}
              />
            )}
          </span>
        </td>
      </tr>
      {open && run.nodeRuns.length > 0 && (
        <tr className="border-b border-border last:border-0 bg-zinc-50/50">
          <td colSpan={4} className="px-3 py-2.5">
            <div className="space-y-1.5">
              {run.nodeRuns.map((nr) => (
                <PlaygroundNodeRow key={nr.id} nodeRun={nr} />
              ))}
            </div>
          </td>
        </tr>
      )}
    </>
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
        <span className="text-[11px] text-zinc-400">
          {field.type === "text_field" ? "Text" : "Image"}
        </span>
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
        <label className="relative flex cursor-pointer items-center justify-center gap-1.5 rounded-lg border border-dashed border-border-strong px-3 py-3 text-xs text-zinc-400 hover:border-zinc-400">
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
            <span className="group relative inline-flex">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={value}
                alt=""
                className="h-36 w-36 rounded object-contain border border-blue-200"
                onError={(e) => {
                  (e.target as HTMLImageElement).style.display = "none";
                }}
              />
              <button
                type="button"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  onChange("");
                }}
                className="absolute -right-1.5 -top-1.5 hidden h-4 w-4 items-center justify-center rounded-full bg-zinc-800 text-white shadow group-hover:flex"
                aria-label="Remove image"
              >
                <X size={9} />
              </button>
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
      <p className="text-xs text-zinc-400">
        Run the workflow to see results here
      </p>
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