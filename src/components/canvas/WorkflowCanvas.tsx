"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import {
  ReactFlow,
  Background,
  BackgroundVariant,
  MiniMap,
  type OnSelectionChangeParams,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { useWorkflowStore } from "@/store/workflowStore";
import { RequestInputsNode } from "@/components/canvas/nodes/RequestInputsNode";
import { ResponseNode } from "@/components/canvas/nodes/ResponseNode";
import { CropImageNode } from "@/components/canvas/nodes/CropImageNode";
import { GeminiNode } from "@/components/canvas/nodes/GeminiNode";
import { CanvasToolbar } from "@/components/canvas/CanvasToolbar";
import { AddNodeChip } from "@/components/canvas/AddNodeChip";
import { TypedEdge } from "@/components/canvas/TypedEdge";
import { Map as MapIcon } from "lucide-react";
import { cn } from "@/lib/utils";

const nodeTypes = {
  "request-inputs": RequestInputsNode,
  response: ResponseNode,
  "crop-image": CropImageNode,
  gemini: GeminiNode,
};

const edgeTypes = {
  default: TypedEdge,
};

export function WorkflowCanvas() {
  const nodes = useWorkflowStore((s) => s.nodes);
  const edges = useWorkflowStore((s) => s.edges);
  const onNodesChange = useWorkflowStore((s) => s.onNodesChange);
  const onEdgesChange = useWorkflowStore((s) => s.onEdgesChange);
  const onConnect = useWorkflowStore((s) => s.onConnect);
  const setSelected = useWorkflowStore((s) => s.setSelected);
  const deleteSelected = useWorkflowStore((s) => s.deleteSelected);
  const undo = useWorkflowStore((s) => s.undo);
  const redo = useWorkflowStore((s) => s.redo);

  const wrapperRef = useRef<HTMLDivElement>(null);
  const [minimapVisible, setMinimapVisible] = useState(true);
  const [selectionMode, setSelectionMode] = useState(false);

  const onSelectionChange = useCallback(
    ({ nodes: selected }: OnSelectionChangeParams) => setSelected(selected.map((n) => n.id)),
    [setSelected]
  );

  const onKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      const meta = e.metaKey || e.ctrlKey;
      if (meta && e.key.toLowerCase() === "z" && !e.shiftKey) {
        e.preventDefault();
        undo();
      } else if (meta && (e.key.toLowerCase() === "y" || (e.key.toLowerCase() === "z" && e.shiftKey))) {
        e.preventDefault();
        redo();
      } else if (e.key === "Delete" || e.key === "Backspace") {
        const target = e.target as HTMLElement;
        if (["INPUT", "TEXTAREA"].includes(target.tagName)) return;
        deleteSelected();
      }
    },
    [undo, redo, deleteSelected]
  );

  const dropPosition = useMemo(
    () => () => {
      const rect = wrapperRef.current?.getBoundingClientRect();
      return { x: (rect?.width ?? 600) / 2 + Math.random() * 60, y: (rect?.height ?? 400) / 2 + Math.random() * 60 };
    },
    []
  );

  return (
    <div ref={wrapperRef} className="relative h-full w-full" onKeyDown={onKeyDown} tabIndex={0}>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        onSelectionChange={onSelectionChange}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        fitView
        minZoom={0.2}
        maxZoom={1.5}
        deleteKeyCode={null}
        proOptions={{ hideAttribution: true }}
        defaultEdgeOptions={{ animated: false }}
        selectionOnDrag={selectionMode}
      >
        <Background variant={BackgroundVariant.Dots} gap={24} size={1.5} color="#c4c4c7" />
        {minimapVisible && <MiniMap position="bottom-right" pannable zoomable bgColor="rgb(27, 27, 24)"
                nodeColor="rgb(167, 139, 250)" maskColor="rgba(27, 27, 24, 0.3)" />}
      </ReactFlow>

      <CanvasToolbar selectionMode={selectionMode} onToggleSelectionMode={() => setSelectionMode((v) => !v)} />
      <AddNodeChip getDropPosition={dropPosition} />

      {/* Sits at the same corner as the minimap, per the reference. When the
          minimap is open this floats just above it (it occupies the bottom
          slot already, so a literal overlap would obscure both); when
          closed, this drops down into the minimap's own spot as the way to
          bring it back. */}
      <button
        onClick={() => setMinimapVisible((v) => !v)}
        aria-label={minimapVisible ? "Hide minimap" : "Show minimap"}
        title={minimapVisible ? "Hide minimap" : "Show minimap"}
        className={cn(
          "absolute right-4 z-20 flex h-9 w-9 items-center justify-center rounded-lg border border-border bg-white text-zinc-500 shadow-lg transition-all hover:bg-zinc-50 hover:text-zinc-700",
          minimapVisible ? "bottom-[180px]" : "bottom-4"
        )}
      >
        <MapIcon size={16} />
      </button>
    </div>
  );
}