// Shared types for the workflow graph. These mirror the React Flow node/edge
// shape exactly so `workflow.nodes` / `workflow.edges` in Postgres can be fed
// straight back into <ReactFlow nodes={...} edges={...}> with no transform.

export type NodeKind = "request-inputs" | "response" | "crop-image" | "gemini";

export type FieldType = "text_field" | "image_field";

export interface RequestInputField {
  id: string; // stable id, used as the source handle id
  name: string; // user-editable label, e.g. "text_field", "image_field_2"
  type: FieldType;
  value?: string; // manual value (text) or uploaded URL (image)
}

export interface RequestInputsNodeData {
  kind: "request-inputs";
  fields: RequestInputField[];
  [key: string]: unknown;
}

export interface ResponseNodeData {
  kind: "response";
  result?: unknown;
  // Custom display-name overrides for each connected source's result card,
  // keyed by edge id. Falls back to the source node's auto-derived label
  // (e.g. "gemini_3_1_pro") when not set.
  resultLabels?: Record<string, string>;
  [key: string]: unknown;
}

export interface CropImageNodeData {
  kind: "crop-image";
  label: string; // "Crop Image", "Crop Image #1" etc for display
  inputImageUrl?: string; // manual entry, disabled if connected
  xPercent: number;
  yPercent: number;
  widthPercent: number;
  heightPercent: number;
  outputImageUrl?: string;
  runStatus?: NodeRunStatus;
  error?: string;
  [key: string]: unknown;
}

export type GeminiModel = "gemini-3.1-pro" | "gemini-2.5-pro" | "gemini-2.5-flash";

export interface GeminiSettings {
  temperature: number; // 0-2
  maxOutputTokens: number;
  topP: number;
}

export interface GeminiNodeData {
  kind: "gemini";
  label: string;
  model: GeminiModel;
  prompt?: string; // manual, disabled if connected
  systemPrompt?: string;
  imageUrls: string[]; // Image (Vision) accepts multiple connections
  videoUrl?: string;
  audioUrl?: string;
  fileUrl?: string;
  settings: GeminiSettings;
  response?: string;
  runStatus?: NodeRunStatus;
  error?: string;
  [key: string]: unknown;
}

export type NextFlowNodeData =
  | RequestInputsNodeData
  | ResponseNodeData
  | CropImageNodeData
  | GeminiNodeData;

export function nodeDisplayLabel(data: NextFlowNodeData): string {
  if (data.kind === "request-inputs") return "Request-Inputs";
  if (data.kind === "response") return "Response";
  return data.label; // crop-image and gemini both carry their own label
}

export function slugifyLabel(label: string): string {
  return label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

export interface WorkflowSummary {
  id: string;
  name: string;
  status: "IDLE" | "RUNNING";
  lastEditedAt: string;
  createdAt: string;
}

export type NodeRunStatus = "idle" | "pending" | "running" | "success" | "failed";

// Handle data-type tags used for type-safe connection validation.
// An edge is only valid if source handle type === target handle type.
export type HandleDataType = "text" | "image" | "video" | "audio" | "file" | "any";

export const HANDLE_COLORS: Record<HandleDataType, string> = {
  text: "#f97316",
  image: "#3b82f6",
  video: "#22c55e",
  audio: "#06b6d4",
  file: "#a855f7",
  any: "#6366f1",
};

// Used specifically for Crop Image's X/Y/Width/Height percent slider dots,
// which are visually distinct (pink/magenta) from the generic "any" color
// used by Response's result handle, even though both share the "any"
// HandleDataType for connection-compatibility purposes (percent sliders
// accept numeric/text connections from any source, same as Response).
export const PERCENT_HANDLE_COLOR = "#ec4899";

export interface NodeRunSummary {
  nodeId: string;
  nodeType: NodeKind;
  nodeLabel: string;
  status: NodeRunStatus;
  inputs: Record<string, unknown>;
  output?: unknown;
  error?: string;
  startedAt?: string;
  completedAt?: string;
  durationMs?: number;
}

export type RunScope = "full" | "partial" | "single";
export type RunStatus = "running" | "success" | "failed" | "partial";

export interface RunSummary {
  id: string;
  workflowId: string;
  status: RunStatus;
  scope: RunScope;
  targetNodeIds: string[];
  startedAt: string;
  completedAt?: string;
  durationMs?: number;
  nodeRuns: NodeRunSummary[];
}