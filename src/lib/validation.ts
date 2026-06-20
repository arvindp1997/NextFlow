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

// Generic React Flow node/edge envelope. The `data` payload is validated more
// loosely here (per-kind shape checked at execution time inside the Trigger.dev
// tasks) so the workflow PATCH route stays robust to incremental UI changes.
export const flowNodeSchema = z.object({
  id: z.string(),
  type: z.enum(["request-inputs", "response", "crop-image", "gemini"]),
  position: z.object({ x: z.number(), y: z.number() }),
  data: z.record(z.unknown()),
});

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
  settings: z.object({
    temperature: z.number().min(0).max(2),
    maxOutputTokens: z.number().int().positive(),
    topP: z.number().min(0).max(1),
  }),
});