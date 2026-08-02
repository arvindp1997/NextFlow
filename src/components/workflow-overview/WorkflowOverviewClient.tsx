"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { cn } from "@/lib/utils";
import type { FlowNode, FlowEdge } from "@/store/workflowStore";
import { Sidebar } from "@/components/dashboard/Sidebar";
import { PlaygroundPanel } from "@/components/workflow-overview/PlaygroundPanel";
import { ReadOnlyWorkflowCanvas } from "./ReadOnlyWorkflowCanvas";

type Tab = "playground" | "api" | "workflow";

export function WorkflowOverviewClient({
  workflowId,
  name,
  nodes: initialNodes,
  edges: initialEdges,
}: {
  workflowId: string;
  name: string;
  nodes: FlowNode[];
  edges: FlowEdge[];
}) {
  const [tab, setTab] = useState<Tab>("playground");
  // Owned here, not inside PlaygroundPanel — PlaygroundPanel is
  // conditionally rendered per-tab and gets fully unmounted when the user
  // switches to the Workflow tab, so state living inside it doesn't
  // survive a tab switch. Living here instead means a run's results (and
  // an in-progress image upload not yet run) persist across tab switches,
  // and the read-only Workflow tab reflects the same up-to-date data.
  const [nodes, setNodes] = useState<FlowNode[]>(initialNodes);
  const [edges, setEdges] = useState<FlowEdge[]>(initialEdges);

  // Fast initial paint uses the (possibly stale) server-rendered props
  // above; then always confirm with a fresh client-side fetch, which
  // bypasses Next.js's Router Cache entirely — unlike those props, which
  // can be served stale when this route is reached via a client-side
  // <Link> shortly after the canvas editor (a separate route/page) saved
  // changes through a plain API route Next has no way to know about.
  useEffect(() => {
    (async () => {
      try {
        const res = await fetch(`/api/workflows/${workflowId}`);
        if (!res.ok) return;
        const json = await res.json();
        setNodes(json.workflow.nodes);
        setEdges(json.workflow.edges);
      } catch {
        // Non-fatal — the props-seeded state above still works, just
        // potentially stale.
      }
    })();
  }, [workflowId]);

  return (
    <div className="flex h-screen">
      <Sidebar defaultCollapsed persist={false} />
      <div className="flex h-screen flex-1 flex-col bg-white">
        <header className="shrink-0 border-b border-border bg-white px-4 pt-2.5 pl-14">
          <div className="flex items-center gap-2 mt-4">
            <Link href="/dashboard" className="rounded-md p-1.5 text-zinc-500 hover:bg-zinc-100">
              <ArrowLeft size={16} />
            </Link>
            <h1 className="truncate text-sm font-semibold text-zinc-900">{name}</h1>
          </div>
          <nav className="mt-5 flex gap-5">
            <TabButton active={tab === "playground"} onClick={() => setTab("playground")}>
              Playground
            </TabButton>
           
            <TabButton active={tab === "workflow"} onClick={() => setTab("workflow")}>
              Workflow
            </TabButton>
          </nav>
        </header>

        <div className="flex-1 overflow-auto">
          {tab === "playground" && (
            <PlaygroundPanel workflowId={workflowId} nodes={nodes} setNodes={setNodes} edges={edges} setEdges={setEdges} />
          )}
          {tab === "workflow" && (
            <ReadOnlyWorkflowCanvas workflowId={workflowId} name={name} nodes={nodes} edges={edges} />
          )}
        </div>
      </div>
    </div>
  );
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "border-b-2 pb-2.5 text-[13px] font-medium transition-colors",
        active ? "border-zinc-900 text-zinc-900" : "border-transparent text-zinc-600 hover:text-zinc-600"
      )}
    >
      {children}
    </button>
  );
}