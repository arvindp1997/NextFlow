import { z } from "zod";

export const fieldTypeSchema = z.enum(["text_field", "image_field"]);

export const requestInputFieldSchema = z.object({
  id: z.string(),
  name: z.string().min(1).max(64),
  type: fieldTypeSchema,
  value: z.string().optional(),
});

export const geminiModelSchema = z.enum([
  "gemini-3.1-pro",
  "gemini-2.5-pro",
  "gemini-2.5-flash",
]);

export const nodeRunStatusSchema = z.enum(["idle", "pending", "running", "success", "failed"]);

const positionSchema = z.object({ x: z.number(), y: z.number() });

export const geminiSettingsSchema = z.object({
  temperature: z.number().min(0).max(2),
  maxOutputTokens: z.number().int().positive(),
  topP: z.number().min(0).max(1),
});

// Per-kind `data` schemas. Structural fields (the ones execution and graph
// resolution actually depend on) are strongly typed; `.passthrough()` lets
// UI-only bookkeeping fields (runStatus, error, label, etc.) ride along
// without every incremental UI change requiring a schema update here.
const requestInputsDataSchema = z
  .object({
    kind: z.literal("request-inputs"),
    fields: z.array(requestInputFieldSchema),
  })
  .passthrough();

const responseDataSchema = z
  .object({
    kind: z.literal("response"),
    result: z.unknown().optional(),
    resultLabels: z.record(z.string()).optional(),
  })
  .passthrough();

const cropImageDataSchema = z
  .object({
    kind: z.literal("crop-image"),
    label: z.string().min(1),
    inputImageUrl: z.string().optional(),
    xPercent: z.number().min(0).max(100),
    yPercent: z.number().min(0).max(100),
    widthPercent: z.number().min(0).max(100),
    heightPercent: z.number().min(0).max(100),
    outputImageUrl: z.string().optional(),
    runStatus: nodeRunStatusSchema.optional(),
    error: z.string().optional(),
  })
  .passthrough();

const geminiDataSchema = z
  .object({
    kind: z.literal("gemini"),
    label: z.string().min(1),
    model: geminiModelSchema,
    prompt: z.string().optional(),
    systemPrompt: z.string().optional(),
    imageUrls: z.array(z.string()).default([]),
    videoUrl: z.string().optional(),
    audioUrl: z.string().optional(),
    fileUrl: z.string().optional(),
    settings: geminiSettingsSchema,
    response: z.string().optional(),
    runStatus: nodeRunStatusSchema.optional(),
    error: z.string().optional(),
  })
  .passthrough();

// Discriminated on `type` so each node kind's `data` payload is validated
// against its actual shape instead of the previous blanket
// `data: z.record(z.unknown())` (which let literally anything through).
export const flowNodeSchema = z.discriminatedUnion("type", [
  z.object({ id: z.string(), type: z.literal("request-inputs"), position: positionSchema, data: requestInputsDataSchema }),
  z.object({ id: z.string(), type: z.literal("response"), position: positionSchema, data: responseDataSchema }),
  z.object({ id: z.string(), type: z.literal("crop-image"), position: positionSchema, data: cropImageDataSchema }),
  z.object({ id: z.string(), type: z.literal("gemini"), position: positionSchema, data: geminiDataSchema }),
]);

export const flowEdgeSchema = z.object({
  id: z.string(),
  source: z.string(),
  target: z.string(),
  sourceHandle: z.string().nullable().optional(),
  targetHandle: z.string().nullable().optional(),
  animated: z.boolean().optional(),
});

export const saveWorkflowSchema = z.object({
  name: z.string().min(1).max(120).optional(),
  nodes: z.array(flowNodeSchema),
  edges: z.array(flowEdgeSchema),
});

export const createWorkflowSchema = z.object({
  name: z.string().min(1).max(120).default("Untitled Workflow"),
  template: z.enum(["blank", "sample"]).default("blank"),
  // For dashboard-level "Import" — creating a brand new workflow directly
  // from an uploaded JSON file rather than starting blank/from a template.
  // When both are present they take precedence over `template`.
  nodes: z.array(flowNodeSchema).optional(),
  edges: z.array(flowEdgeSchema).optional(),
});

export const renameWorkflowSchema = z.object({
  name: z.string().min(1).max(120),
});

export const runWorkflowSchema = z.object({
  scope: z.enum(["full", "partial", "single"]),
  targetNodeIds: z.array(z.string()).default([]),
});

export const cropImagePayloadSchema = z.object({
  inputImageUrl: z.string().url(),
  xPercent: z.number().min(0).max(100),
  yPercent: z.number().min(0).max(100),
  widthPercent: z.number().min(0).max(100),
  heightPercent: z.number().min(0).max(100),
});

export const geminiPayloadSchema = z.object({
  model: geminiModelSchema,
  prompt: z.string().min(1),
  systemPrompt: z.string().optional(),
  imageUrls: z.array(z.string().url()).default([]),
  videoUrl: z.string().url().optional(),
  audioUrl: z.string().url().optional(),
  fileUrl: z.string().url().optional(),
  settings: geminiSettingsSchema,
});

// ---------------------------------------------------------------------------
// Edge / handle compatibility validation.
//
// Each node kind exposes a fixed set of named handles (request-inputs and
// response are the two exceptions — their handles are data-driven / generic,
// handled as special cases below). An edge is only valid if:
//   1. both endpoints reference nodes that actually exist,
//   2. both handle ids actually exist on their respective node,
//   3. the source handle's data type matches the target handle's data type
//      (an "any" handle — Response's `result`, Crop Image's percent
//      sliders — accepts a connection from any data type).
// This mirrors the frontend's own connection-validation rules (see
// HANDLE_COLORS / HandleDataType in lib/types.ts) so a payload that never
// touched the canvas (e.g. a raw JSON import) can't sneak in a
// type-incompatible or nonexistent-handle edge.
// ---------------------------------------------------------------------------

export type HandleDataType = "text" | "image" | "video" | "audio" | "file" | "any";

interface HandleGraphNode {
  id: string;
  type: "request-inputs" | "response" | "crop-image" | "gemini";
  data: unknown;
}

interface HandleGraphEdge {
  id: string;
  source: string;
  target: string;
  sourceHandle?: string | null;
  targetHandle?: string | null;
}

const CROP_PERCENT_HANDLES = new Set(["x_percent", "y_percent", "width_percent", "height_percent"]);

function handleDataType(
  node: HandleGraphNode,
  handleId: string,
  direction: "source" | "target"
): HandleDataType | null {
  switch (node.type) {
    case "request-inputs": {
      if (direction !== "source") return null;
      const fields = (node.data as { fields?: Array<{ id: string; type: string }> })?.fields ?? [];
      const field = fields.find((f) => f.id === handleId);
      if (!field) return null;
      return field.type === "image_field" ? "image" : "text";
    }
    case "response":
      return direction === "target" && handleId === "result" ? "any" : null;
    case "crop-image":
      if (direction === "target") {
        if (handleId === "input_image") return "image";
        if (CROP_PERCENT_HANDLES.has(handleId)) return "any";
        return null;
      }
      return handleId === "output_image" ? "image" : null;
    case "gemini":
      if (direction === "target") {
        if (handleId === "prompt" || handleId === "system_prompt") return "text";
        if (handleId === "video") return "video";
        if (handleId === "audio") return "audio";
        if (handleId === "file") return "file";
        if (handleId === "image_vision") return "image";
        return null;
      }
      return handleId === "response" ? "text" : null;
    default:
      return null;
  }
}

/** Returns a list of human-readable error messages; empty means the graph is valid. */
export function validateGraphHandles(nodes: HandleGraphNode[], edges: HandleGraphEdge[]): string[] {
  const nodeById = new Map(nodes.map((n) => [n.id, n]));
  const errors: string[] = [];

  for (const edge of edges) {
    const source = nodeById.get(edge.source);
    const target = nodeById.get(edge.target);
    if (!source || !target) {
      errors.push(`Edge "${edge.id}" references a node that doesn't exist in this workflow`);
      continue;
    }

    const sourceType = handleDataType(source, edge.sourceHandle ?? "", "source");
    if (!sourceType) {
      errors.push(`Edge "${edge.id}": "${edge.sourceHandle ?? ""}" is not a valid output handle on ${source.type} node "${source.id}"`);
      continue;
    }

    const targetType = handleDataType(target, edge.targetHandle ?? "", "target");
    if (!targetType) {
      errors.push(`Edge "${edge.id}": "${edge.targetHandle ?? ""}" is not a valid input handle on ${target.type} node "${target.id}"`);
      continue;
    }

    if (sourceType !== "any" && targetType !== "any" && sourceType !== targetType) {
      errors.push(
        `Edge "${edge.id}": type mismatch connecting ${sourceType} output to ${targetType} input`
      );
    }
  }

  return errors;
}