import { create } from "zustand";
import {
  type Connection,
  type Edge,
  type EdgeChange,
  type Node,
  type NodeChange,
  applyEdgeChanges,
  applyNodeChanges,
  addEdge,
} from "@xyflow/react";
import type {
  CropImageNodeData,
  GeminiNodeData,
  HandleDataType,
  NextFlowNodeData,
  RequestInputsNodeData,
  ResponseNodeData,
} from "@/lib/types";
import { uid } from "@/lib/utils";

export type FlowNode = Node<NextFlowNodeData>;
export type FlowEdge = Edge;

interface HistoryEntry {
  nodes: FlowNode[];
  edges: FlowEdge[];
}

interface WorkflowState {
  workflowId: string | null;
  name: string;
  nodes: FlowNode[];
  edges: FlowEdge[];
  selectedNodeIds: string[];
  past: HistoryEntry[];
  future: HistoryEntry[];
  dirty: boolean;

  load: (workflowId: string, name: string, nodes: FlowNode[], edges: FlowEdge[]) => void;
  importGraph: (nodes: FlowNode[], edges: FlowEdge[], name?: string) => void;
  onNodesChange: (changes: NodeChange<FlowNode>[]) => void;
  onEdgesChange: (changes: EdgeChange<FlowEdge>[]) => void;
  onConnect: (connection: Connection) => void;
  deleteEdge: (edgeId: string) => void;
  addNode: (type: "crop-image" | "gemini", position: { x: number; y: number }) => void;
  updateNodeData: (nodeId: string, patch: Partial<NextFlowNodeData>) => void;
  deleteNode: (nodeId: string) => void;
  deleteSelected: () => void;
  setSelected: (ids: string[]) => void;
  undo: () => void;
  redo: () => void;
  applyRunStatuses: (statuses: Record<string, "idle" | "pending" | "running" | "success" | "failed">) => void;
  applyNodeResults: (results: Record<string, unknown>) => void;
}

const NON_DELETABLE: NextFlowNodeData["kind"][] = ["request-inputs", "response"];

function snapshot(state: WorkflowState): HistoryEntry {
  return { nodes: state.nodes, edges: state.edges };
}

function pushHistory(get: () => WorkflowState, set: (partial: Partial<WorkflowState>) => void) {
  const s = get();
  set({ past: [...s.past, snapshot(s)].slice(-50), future: [] });
}

export const useWorkflowStore = create<WorkflowState>((set, get) => ({
  workflowId: null,
  name: "Untitled Workflow",
  nodes: [],
  edges: [],
  selectedNodeIds: [],
  past: [],
  future: [],
  dirty: false,

  load: (workflowId, name, nodes, edges) => {
    set({ workflowId, name, nodes, edges, past: [], future: [], dirty: false, selectedNodeIds: [] });
  },

  /**
   * Used by JSON import. Unlike load() (used for the initial fetch-from-DB
   * mount, intentionally NOT dirty), this marks dirty in the SAME set()
   * call that replaces nodes/edges, so the autosave subscriber's
   * `state.nodes !== prev.nodes` check actually sees a change and fires.
   * Calling load() then a separate `setState({dirty: true})` looks correct
   * in the browser but silently never persists, since by the second call
   * nodes/edges are already the new value and "haven't changed" relative
   * to that call's own prev state — this was a real bug where Import
   * appeared to work but never actually saved to the database.
   */
  importGraph: (nodes, edges, name) => {
    pushHistory(get, set);
    set({
      nodes,
      edges,
      ...(name ? { name } : {}),
      selectedNodeIds: [],
      dirty: true,
    });
  },

  onNodesChange: (changes) => {
    const structural = changes.some((c) => c.type === "remove" || c.type === "add");
    if (structural) pushHistory(get, set);
    set({ nodes: applyNodeChanges(changes, get().nodes), dirty: true });
  },

  onEdgesChange: (changes) => {
    const structural = changes.some((c) => c.type === "remove" || c.type === "add");
    if (structural) pushHistory(get, set);
    set({ edges: applyEdgeChanges(changes, get().edges), dirty: true });
  },

  onConnect: (connection) => {
    if (!isValidConnection(connection, get().nodes)) return;
    pushHistory(get, set);
    set({
      edges: addEdge({ ...connection, animated: true }, get().edges),
      dirty: true,
    });
  },

  deleteEdge: (edgeId) => {
    pushHistory(get, set);
    set({ edges: get().edges.filter((e) => e.id !== edgeId), dirty: true });
  },

  addNode: (type, position) => {
    pushHistory(get, set);
    const id = uid("node");
    const count = get().nodes.filter((n) => n.type === type).length + 1;
    const data: NextFlowNodeData =
      type === "crop-image"
        ? ({
            kind: "crop-image",
            label: count > 1 ? `Crop Image #${count}` : "Crop Image",
            xPercent: 0,
            yPercent: 0,
            widthPercent: 100,
            heightPercent: 100,
            runStatus: "idle",
          } satisfies CropImageNodeData)
        : ({
            kind: "gemini",
            label: count > 1 ? `Gemini 3.1 Pro #${count}` : "Gemini 3.1 Pro",
            model: "gemini-3.1-pro",
            imageUrls: [],
            settings: { temperature: 1, maxOutputTokens: 2048, topP: 0.95 },
            runStatus: "idle",
          } satisfies GeminiNodeData);

    const node: FlowNode = { id, type, position, data };
    set({ nodes: [...get().nodes, node], dirty: true });
  },

  updateNodeData: (nodeId, patch) => {
    set({
      nodes: get().nodes.map((n) => (n.id === nodeId ? { ...n, data: { ...n.data, ...patch } as NextFlowNodeData } : n)),
      dirty: true,
    });
  },

  deleteNode: (nodeId) => {
    const node = get().nodes.find((n) => n.id === nodeId);
    if (!node || NON_DELETABLE.includes(node.data.kind)) return;
    pushHistory(get, set);
    set({
      nodes: get().nodes.filter((n) => n.id !== nodeId),
      edges: get().edges.filter((e) => e.source !== nodeId && e.target !== nodeId),
      dirty: true,
    });
  },

  deleteSelected: () => {
    const { selectedNodeIds } = get();
    const deletable = selectedNodeIds.filter((id) => {
      const n = get().nodes.find((node) => node.id === id);
      return n && !NON_DELETABLE.includes(n.data.kind);
    });
    if (deletable.length === 0) return;
    pushHistory(get, set);
    set({
      nodes: get().nodes.filter((n) => !deletable.includes(n.id)),
      edges: get().edges.filter((e) => !deletable.includes(e.source) && !deletable.includes(e.target)),
      selectedNodeIds: [],
      dirty: true,
    });
  },

  setSelected: (ids) => set({ selectedNodeIds: ids }),

  undo: () => {
    const { past } = get();
    if (past.length === 0) return;
    const previous = past[past.length - 1];
    if (!previous) return;
    set({
      past: past.slice(0, -1),
      future: [snapshot(get()), ...get().future].slice(0, 50),
      nodes: previous.nodes,
      edges: previous.edges,
      dirty: true,
    });
  },

  redo: () => {
    const { future } = get();
    if (future.length === 0) return;
    const next = future[0];
    if (!next) return;
    set({
      future: future.slice(1),
      past: [...get().past, snapshot(get())].slice(-50),
      nodes: next.nodes,
      edges: next.edges,
      dirty: true,
    });
  },

  applyRunStatuses: (statuses) => {
    set({
      nodes: get().nodes.map((n) =>
        statuses[n.id] !== undefined ? { ...n, data: { ...n.data, runStatus: statuses[n.id] } as NextFlowNodeData } : n
      ),
    });
  },

  applyNodeResults: (results) => {
    set({
      nodes: get().nodes.map((n) => {
        if (results[n.id] === undefined) return n;
        const r = results[n.id] as Record<string, unknown>;
        if (n.data.kind === "crop-image") {
          // nodeRun.output stores the Crop Image task's raw return shape
          // ({ outputImageUrl }), not the internal "output_image" handle-id
          // naming used by the DAG resolver in src/lib/graph.ts.
          return { ...n, data: { ...n.data, outputImageUrl: r.outputImageUrl as string } };
        }
        if (n.data.kind === "gemini") {
          return { ...n, data: { ...n.data, response: r.response as string } };
        }
        if (n.data.kind === "response") {
          return { ...n, data: { ...n.data, result: r.result } };
        }
        return n;
      }),
    });
  },
}));

/** Type-safe connection validation: a handle's data-type must match on both ends. */
export function isValidConnection(connection: Connection, nodes: FlowNode[]): boolean {
  const sourceType = handleType(connection.source, connection.sourceHandle, nodes, "source");
  const targetType = handleType(connection.target, connection.targetHandle, nodes, "target");
  if (!sourceType || !targetType) return false;
  if (sourceType === "any" || targetType === "any") return true;
  return sourceType === targetType;
}

export function handleType(
  nodeId: string | null,
  handleId: string | null | undefined,
  nodes: FlowNode[],
  side: "source" | "target"
): HandleDataType | null {
  const node = nodes.find((n) => n.id === nodeId);
  if (!node) return null;
  const h = handleId ?? "";

  if (node.data.kind === "request-inputs") {
    const field = (node.data as RequestInputsNodeData).fields.find((f) => f.id === h);
    return field ? (field.type === "image_field" ? "image" : "text") : null;
  }
  if (node.data.kind === "crop-image") {
    if (side === "source") return h === "output_image" ? "image" : null;
    if (h === "input_image") return "image";
    return "any"; // percent sliders accept numeric/text connections
  }
  if (node.data.kind === "gemini") {
    if (side === "source") return h === "response" ? "text" : null;
    if (h === "prompt" || h === "system_prompt") return "text";
    if (h === "image_vision") return "image";
    if (h === "video") return "video";
    if (h === "audio") return "audio";
    if (h === "file") return "file";
    return null;
  }
  if (node.data.kind === "response") {
    return side === "target" && h === "result" ? "any" : null;
  }
  return null;
}

export type { ResponseNodeData };