"use client";

import { useCallback, useMemo, useRef } from "react";
import {
  ReactFlow,
  Background,
  BackgroundVariant,
  MiniMap,
  Controls,
  type OnSelectionChangeParams,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { useWorkflowStore } from "@/store/workflowStore";
import { RequestInputsNode } from "@/components/canvas/nodes/RequestInputsNode";
import { ResponseNode } from "@/components/canvas/nodes/ResponseNode";
import { CropImageNode } from "@/components/canvas/nodes/CropImageNode";
import { GeminiNode } from "@/components/canvas/nodes/GeminiNode";
import { NodePicker } from "@/components/canvas/NodePicker";

const nodeTypes = {
  "request-inputs": RequestInputsNode,
  response: ResponseNode,
  "crop-image": CropImageNode,
  gemini: GeminiNode,
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
        fitView
        minZoom={0.2}
        maxZoom={1.5}
        deleteKeyCode={null}
        proOptions={{ hideAttribution: true }}
        defaultEdgeOptions={{ animated: true, style: { stroke: "#f97316", strokeWidth: 2 } }}
      >
        <Background variant={BackgroundVariant.Dots} gap={20} size={1} color="#d4d4d4" />
        <MiniMap position="bottom-right" pannable zoomable nodeColor="#e5e5e5" maskColor="rgba(250,250,250,0.7)" />
        <Controls position="bottom-left" showInteractive={false} />
      </ReactFlow>

      <NodePicker getDropPosition={dropPosition} />
    </div>
  );
}
