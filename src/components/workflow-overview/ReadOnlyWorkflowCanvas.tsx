"use client";

import { useEffect } from "react";
import Link from "next/link";
import { ReactFlow, ReactFlowProvider, Background, BackgroundVariant, MiniMap } from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { Pencil } from "lucide-react";
import { useWorkflowStore, type FlowNode, type FlowEdge } from "@/store/workflowStore";
import { RequestInputsNode } from "@/components/canvas/nodes/RequestInputsNode";
import { ResponseNode } from "@/components/canvas/nodes/ResponseNode";
import { CropImageNode } from "@/components/canvas/nodes/CropImageNode";
import { GeminiNode } from "@/components/canvas/nodes/GeminiNode";
import { TypedEdge } from "@/components/canvas/TypedEdge";

const nodeTypes = {
  "request-inputs": RequestInputsNode,
  response: ResponseNode,
  "crop-image": CropImageNode,
  gemini: GeminiNode,
};

const edgeTypes = { default: TypedEdge };

export function ReadOnlyWorkflowCanvas({
  workflowId,
  name,
  nodes,
  edges,
}: {
  workflowId: string;
  name: string;
  nodes: FlowNode[];
  edges: FlowEdge[];
}) {
  return (
        <div className="m-4 flex h-full flex-col rounded-2xl border border-gray-200">
          <div className="flex shrink-0 items-center justify-between border-b border-border  px-4 py-5">
        <h2 className="text-sm font-semibold text-zinc-900 pl-4">Workflow Structure</h2>
        <Link
          href={`/workflow/${workflowId}/edit`}
          className="flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-zinc-700 hover:bg-zinc-50"
        >
          <Pencil size={13} /> Edit Workflow
        </Link>
      </div>
      <div className="relative flex-1">
        <ReactFlowProvider>
          <CanvasPreview workflowId={workflowId} name={name} nodes={nodes} edges={edges} />
        </ReactFlowProvider>
      </div>
    </div>
  );
}

function CanvasPreview({
  workflowId,
  name,
  nodes,
  edges,
}: {
  workflowId: string;
  name: string;
  nodes: FlowNode[];
  edges: FlowEdge[];
}) {
  const load = useWorkflowStore((s) => s.load);
  const storeNodes = useWorkflowStore((s) => s.nodes);
  const storeEdges = useWorkflowStore((s) => s.edges);
  const onNodesChange = useWorkflowStore((s) => s.onNodesChange);
  const onEdgesChange = useWorkflowStore((s) => s.onEdgesChange);

  // Reuses the same global store the editor uses, purely so the real node
  // components (which read their own data via this store) render exactly
  // as they do on the canvas. Interaction is blocked separately below, so
  // this never results in an actual edit even though it's the same store.
  useEffect(() => {
    load(workflowId, name, nodes, edges);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workflowId]);

  return (
    <div className="nextflow-readonly-canvas h-full w-full">
      <ReactFlow
        nodes={storeNodes}
        edges={storeEdges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        nodesDraggable={false}
        nodesConnectable={false}
        elementsSelectable={false}
        panOnDrag
        zoomOnScroll
        fitView
        minZoom={0.1}
        maxZoom={1.5}
        deleteKeyCode={null}
        proOptions={{ hideAttribution: true }}
        defaultEdgeOptions={{ animated: false }}
      >
        <Background variant={BackgroundVariant.Dots} gap={24} size={1.5} color="#c4c4c7" />
        <MiniMap position="bottom-right" pannable zoomable bgColor="rgb(27, 27, 24)"
                nodeColor="rgb(167, 139, 250)" maskColor="rgba(27, 27, 24, 0.3)" />
      </ReactFlow>
    </div>
  );
}