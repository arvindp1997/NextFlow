"use client";

import { useState } from "react";
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
  nodes,
  edges,
}: {
  workflowId: string;
  name: string;
  nodes: FlowNode[];
  edges: FlowEdge[];
}) {
  const [tab, setTab] = useState<Tab>("playground");

  return (
    <div className="flex h-screen">
      <Sidebar defaultCollapsed persist={false} />
      <div className="flex h-screen flex-1 flex-col bg-canvas">
        <header className="shrink-0 border-b border-border bg-white px-4 pt-2.5">
          <div className="flex items-center gap-2">
            <Link href="/dashboard" className="rounded-md p-1.5 text-zinc-500 hover:bg-zinc-100">
              <ArrowLeft size={16} />
            </Link>
            <h1 className="truncate text-sm font-semibold text-zinc-900">{name}</h1>
          </div>
          <nav className="mt-3 flex gap-5">
            <TabButton active={tab === "playground"} onClick={() => setTab("playground")}>
              Playground
            </TabButton>
            <TabButton active={tab === "api"} onClick={() => setTab("api")}>
              API
            </TabButton>
            <TabButton active={tab === "workflow"} onClick={() => setTab("workflow")}>
              Workflow
            </TabButton>
          </nav>
        </header>

        <div className="flex-1 overflow-hidden">
          {tab === "playground" && (
            <PlaygroundPanel workflowId={workflowId} initialNodes={nodes} initialEdges={edges} />
          )}
          {tab === "api" && <ApiPlaceholder />}
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
        active ? "border-zinc-900 text-zinc-900" : "border-transparent text-zinc-400 hover:text-zinc-600"
      )}
    >
      {children}
    </button>
  );
}

function ApiPlaceholder() {
  return (
    <div className="flex h-full items-center justify-center">
      <p className="text-sm text-zinc-400">API access isn&apos;t available for this workflow yet.</p>
    </div>
  );
}