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
  selectedEdgeIds: string[];
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
  duplicateNode: (nodeId: string) => void;
  deleteSelected: () => void;
  setSelected: (ids: string[]) => void;
  setSelectedEdges: (ids: string[]) => void;
  autoArrange: () => void;
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
  selectedEdgeIds: [],
  past: [],
  future: [],
  dirty: false,

  load: (workflowId, name, nodes, edges) => {
    set({ workflowId, name, nodes, edges, past: [], future: [], dirty: false, selectedNodeIds: [], selectedEdgeIds: [] });
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
      edges: addEdge({ ...connection, animated: false }, get().edges),
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

  duplicateNode: (nodeId) => {
    const node = get().nodes.find((n) => n.id === nodeId);
    if (!node || NON_DELETABLE.includes(node.data.kind)) return;
    pushHistory(get, set);
    const id = uid(node.data.kind);
    const clone: FlowNode = {
      ...node,
      id,
      position: { x: node.position.x + 32, y: node.position.y + 32 },
      data: { ...node.data },
      selected: false,
    };
    set({ nodes: [...get().nodes, clone], selectedNodeIds: [id], dirty: true });
  },

  deleteSelected: () => {
    const { selectedNodeIds, selectedEdgeIds } = get();
    const deletableNodes = selectedNodeIds.filter((id) => {
      const n = get().nodes.find((node) => node.id === id);
      return n && !NON_DELETABLE.includes(n.data.kind);
    });
    if (deletableNodes.length === 0 && selectedEdgeIds.length === 0) return;
    pushHistory(get, set);
    set({
      nodes: get().nodes.filter((n) => !deletableNodes.includes(n.id)),
      edges: get().edges.filter(
        (e) =>
          !selectedEdgeIds.includes(e.id) &&
          !deletableNodes.includes(e.source) &&
          !deletableNodes.includes(e.target)
      ),
      selectedNodeIds: [],
      selectedEdgeIds: [],
      dirty: true,
    });
  },

  setSelected: (ids) => set({ selectedNodeIds: ids }),
  setSelectedEdges: (ids) => set({ selectedEdgeIds: ids }),

  autoArrange: () => {
    const { nodes, edges } = get();
    if (nodes.length === 0) return;
    pushHistory(get, set);

    const H_GAP = 120;  // horizontal gap between columns
    const V_GAP = 80;  // vertical gap between nodes in the same column

    // Default fallback dimensions if a node hasn't been measured yet
    const DEFAULT_W = 280;
    const DEFAULT_H = 320;

    function nodeW(id: string) {
      const n = nodes.find((n) => n.id === id);
      return (n as { measured?: { width?: number } })?.measured?.width ?? DEFAULT_W;
    }
    function nodeH(id: string) {
      const n = nodes.find((n) => n.id === id);
      return (n as { measured?: { height?: number } })?.measured?.height ?? DEFAULT_H;
    }

    // Build incoming-edge map: nodeId → set of upstream nodeIds
    const deps = new Map<string, Set<string>>();
    for (const n of nodes) deps.set(n.id, new Set());
    for (const e of edges) deps.get(e.target)?.add(e.source);

    // Assign each node a column = longest path from any root
    const col = new Map<string, number>();
    const visiting = new Set<string>();

    function dfs(id: string): number {
      if (col.has(id)) return col.get(id)!;
      if (visiting.has(id)) return 0; // cycle guard
      visiting.add(id);
      const upstream = deps.get(id) ?? new Set();
      const depth = upstream.size === 0
        ? 0
        : Math.max(...[...upstream].map((dep) => dfs(dep) + 1));
      col.set(id, depth);
      visiting.delete(id);
      return depth;
    }
    for (const n of nodes) dfs(n.id);

    // Group node IDs by column
    const byCol = new Map<number, string[]>();
    for (const [id, c] of col) {
      if (!byCol.has(c)) byCol.set(c, []);
      byCol.get(c)!.push(id);
    }

    const maxCol = Math.max(...col.values());

    // Calculate each column's x position based on the max node width in the previous column
    const colX: number[] = [];
    let curX = 80;
    for (let c = 0; c <= maxCol; c++) {
      colX[c] = curX;
      const ids = byCol.get(c) ?? [];
      const maxW = ids.length > 0 ? Math.max(...ids.map(nodeW)) : DEFAULT_W;
      curX += maxW + H_GAP;
    }

    // Calculate the tallest column total height for centering
    const colTotalH = (c: number) => {
      const ids = byCol.get(c) ?? [];
      return ids.reduce((sum, id) => sum + nodeH(id) + V_GAP, 0) - V_GAP;
    };
    const maxColH = Math.max(...Array.from({ length: maxCol + 1 }, (_, c) => colTotalH(c)));
    const midY = 80 + maxColH / 2;

    // Assign final positions
    const positions = new Map<string, { x: number; y: number }>();
    for (let c = 0; c <= maxCol; c++) {
      const ids = byCol.get(c) ?? [];
      const totalH = colTotalH(c);
      let y = midY - totalH / 2;
      for (const id of ids) {
        positions.set(id, { x: colX[c] ?? 80, y });
        y += nodeH(id) + V_GAP;
      }
    }

    set({
      nodes: nodes.map((n) => ({ ...n, position: positions.get(n.id) ?? n.position })),
      dirty: true,
    });
  },

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
          // buildNodeOutput stores the URL under the handle-id key "output_image".
          // The NodeRun.output field therefore has shape { output_image: url }.
          // We also accept "outputImageUrl" as a fallback for runs recorded
          // before this fix, where the crop task's raw return value was saved directly.
          const url = (r.output_image ?? r.outputImageUrl) as string | undefined;
          if (!url) return n;
          return { ...n, data: { ...n.data, outputImageUrl: url } };
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