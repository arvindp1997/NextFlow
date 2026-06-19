import type {
  CropImageNodeData,
  GeminiNodeData,
  RequestInputsNodeData,
  ResponseNodeData,
} from "@/lib/types";

export interface FlowNode {
  id: string;
  type: "request-inputs" | "response" | "crop-image" | "gemini";
  data: RequestInputsNodeData | ResponseNodeData | CropImageNodeData | GeminiNodeData;
}

export interface FlowEdge {
  id: string;
  source: string;
  target: string;
  sourceHandle?: string | null;
  targetHandle?: string | null;
}

/** nodeId -> set of nodeIds it directly depends on (its upstream sources) */
export function buildDependencyGraph(nodes: FlowNode[], edges: FlowEdge[]): Map<string, Set<string>> {
  const deps = new Map<string, Set<string>>();
  for (const node of nodes) deps.set(node.id, new Set());
  for (const edge of edges) {
    if (!deps.has(edge.target)) deps.set(edge.target, new Set());
    deps.get(edge.target)!.add(edge.source);
  }
  return deps;
}

/** Detects a cycle in the graph; returns true if one exists (DAG validation). */
export function hasCycle(nodes: FlowNode[], edges: FlowEdge[]): boolean {
  const deps = buildDependencyGraph(nodes, edges);
  const VISITING = 1;
  const DONE = 2;
  const state = new Map<string, number>();

  function visit(id: string): boolean {
    const s = state.get(id);
    if (s === DONE) return false;
    if (s === VISITING) return true; // back-edge -> cycle
    state.set(id, VISITING);
    for (const dep of deps.get(id) ?? []) {
      if (visit(dep)) return true;
    }
    state.set(id, DONE);
    return false;
  }

  for (const node of nodes) {
    if (visit(node.id)) return true;
  }
  return false;
}

/** Given scope, returns the full set of node ids that must run (targets + all their transitive deps). */
export function resolveExecutionSet(
  nodes: FlowNode[],
  _edges: FlowEdge[],
  scope: "full" | "partial" | "single",
  targetNodeIds: string[]
): Set<string> {
  if (scope === "full") return new Set(nodes.map((n) => n.id));
  // Per spec: single-node and multi-select runs execute ONLY the targeted
  // nodes — upstream dependencies are not re-run. Their last-known output
  // (already sitting in node.data from a previous run) is used instead; see
  // getCachedNodeOutput below, used to seed the orchestrator's outputs map.
  return new Set(targetNodeIds);
}

/**
 * Reads a node's last-known output straight off its persisted canvas data,
 * for use when that node is an upstream dependency that is NOT being
 * re-executed in this run (single-node / multi-select scope).
 */
export function getCachedNodeOutput(node: FlowNode): OutputMap {
  switch (node.type) {
    case "request-inputs":
      return buildNodeOutput(node, undefined);
    case "crop-image":
      return buildNodeOutput(node, { outputImageUrl: (node.data as CropImageNodeData).outputImageUrl });
    case "gemini":
      return buildNodeOutput(node, { response: (node.data as GeminiNodeData).response });
    case "response":
      return {};
  }
}

type OutputMap = Record<string, unknown>;
/** nodeId -> { handleId: value } for every node that has completed so far */
export type NodeOutputs = Record<string, OutputMap>;

function valuesForHandle(
  nodeId: string,
  handleId: string,
  edges: FlowEdge[],
  outputs: NodeOutputs
): unknown[] {
  const incoming = edges.filter((e) => e.target === nodeId && (e.targetHandle ?? "") === handleId);
  return incoming
    .map((e) => outputs[e.source]?.[e.sourceHandle ?? ""])
    .filter((v) => v !== undefined && v !== null);
}

/** Resolves a single-value input: connected edge wins over the manual field value. */
function resolveScalar(
  nodeId: string,
  handleId: string,
  manualValue: unknown,
  edges: FlowEdge[],
  outputs: NodeOutputs
): unknown {
  const values = valuesForHandle(nodeId, handleId, edges, outputs);
  if (values.length > 0) return values[0];
  return manualValue;
}

/** Resolves a multi-value input (e.g. Gemini's Image (Vision) handle, which accepts many connections). */
function resolveArray(
  nodeId: string,
  handleId: string,
  edges: FlowEdge[],
  outputs: NodeOutputs
): unknown[] {
  return valuesForHandle(nodeId, handleId, edges, outputs);
}

/**
 * Computes the concrete input payload a node needs to execute, applying the
 * "connection overrides manual entry" rule from the spec.
 */
export function resolveNodeInputs(
  node: FlowNode,
  edges: FlowEdge[],
  outputs: NodeOutputs
): Record<string, unknown> {
  switch (node.type) {
    case "request-inputs":
      return {}; // request-inputs has no inputs; its fields *are* the outputs
    case "crop-image": {
      const d = node.data as CropImageNodeData;
      return {
        inputImageUrl: resolveScalar(node.id, "input_image", d.inputImageUrl, edges, outputs),
        xPercent: Number(resolveScalar(node.id, "x_percent", d.xPercent, edges, outputs) ?? 0),
        yPercent: Number(resolveScalar(node.id, "y_percent", d.yPercent, edges, outputs) ?? 0),
        widthPercent: Number(resolveScalar(node.id, "width_percent", d.widthPercent, edges, outputs) ?? 100),
        heightPercent: Number(resolveScalar(node.id, "height_percent", d.heightPercent, edges, outputs) ?? 100),
      };
    }
    case "gemini": {
      const d = node.data as GeminiNodeData;
      return {
        model: d.model,
        prompt: resolveScalar(node.id, "prompt", d.prompt, edges, outputs),
        systemPrompt: resolveScalar(node.id, "system_prompt", d.systemPrompt, edges, outputs),
        imageUrls: resolveArray(node.id, "image_vision", edges, outputs),
        videoUrl: resolveScalar(node.id, "video", d.videoUrl, edges, outputs),
        audioUrl: resolveScalar(node.id, "audio", d.audioUrl, edges, outputs),
        fileUrl: resolveScalar(node.id, "file", d.fileUrl, edges, outputs),
        settings: d.settings,
      };
    }
    case "response": {
      return { result: resolveScalar(node.id, "result", undefined, edges, outputs) };
    }
  }
}

/** Produces the {handleId: value} output map for a node once it has finished. */
export function buildNodeOutput(node: FlowNode, result: unknown): OutputMap {
  switch (node.type) {
    case "request-inputs": {
      const d = node.data as RequestInputsNodeData;
      const out: OutputMap = {};
      for (const field of d.fields) out[field.id] = field.value;
      return out;
    }
    case "crop-image":
      return { output_image: (result as { outputImageUrl?: string })?.outputImageUrl };
    case "gemini":
      return { response: (result as { response?: string })?.response };
    case "response":
      return {};
  }
}
