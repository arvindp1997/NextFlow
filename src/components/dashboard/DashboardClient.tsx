"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Plus, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Sidebar } from "@/components/dashboard/Sidebar";
import { WorkflowCard } from "@/components/dashboard/WorkflowCard";
import { EmptyState } from "@/components/dashboard/EmptyState";
import { CreateWorkflowDialog } from "@/components/dashboard/CreateWorkflowDialog";
import { RenameDialog } from "@/components/dashboard/RenameDialog";
import { DeleteDialog } from "@/components/dashboard/DeleteDialog";
import type { WorkflowSummary } from "@/lib/types";

export function DashboardClient({ initialWorkflows }: { initialWorkflows: WorkflowSummary[] }) {
  const router = useRouter();
  const [workflows, setWorkflows] = useState(initialWorkflows);
  const [creating, setCreating] = useState(false);
  const [renaming, setRenaming] = useState<WorkflowSummary | null>(null);
  const [deleting, setDeleting] = useState<WorkflowSummary | null>(null);

  async function handleCreate(name: string, template: "blank" | "sample" = "blank") {
    const res = await fetch("/api/workflows", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, template }),
    });
    if (!res.ok) return;
    const { workflow } = await res.json();
    router.push(`/workflow/${workflow.id}`);
  }

  async function handleRename(id: string, name: string) {
    const res = await fetch(`/api/workflows/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    });
    if (!res.ok) return;
    setWorkflows((prev) => prev.map((w) => (w.id === id ? { ...w, name } : w)));
    setRenaming(null);
  }

  async function handleDelete(id: string) {
    const res = await fetch(`/api/workflows/${id}`, { method: "DELETE" });
    if (!res.ok) return;
    setWorkflows((prev) => prev.filter((w) => w.id !== id));
    setDeleting(null);
  }

  return (
    <div className="flex min-h-screen bg-canvas">
      <Sidebar />
      <main className="flex-1 px-8 py-8">
        <div className="mx-auto max-w-5xl">
          <div className="mb-6 flex items-center justify-between">
            <div>
              <h1 className="text-xl font-semibold text-zinc-900">Your workflows</h1>
              <p className="mt-1 text-sm text-zinc-500">Build and run LLM workflows with Gemini.</p>
            </div>
            <div className="flex items-center gap-2">
              <Button variant="secondary" onClick={() => handleCreate("Product Marketing Pipeline (Sample)", "sample")}>
                <Sparkles size={16} /> Load Sample Workflow
              </Button>
              <Button onClick={() => setCreating(true)}>
                <Plus size={16} /> New Workflow
              </Button>
            </div>
          </div>

          {workflows.length === 0 ? (
            <EmptyState onCreate={() => setCreating(true)} />
          ) : (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {workflows.map((w) => (
                <WorkflowCard
                  key={w.id}
                  workflow={w}
                  onOpen={() => router.push(`/workflow/${w.id}`)}
                  onRename={() => setRenaming(w)}
                  onDelete={() => setDeleting(w)}
                />
              ))}
            </div>
          )}
        </div>
      </main>

      <CreateWorkflowDialog open={creating} onClose={() => setCreating(false)} onCreate={handleCreate} />
      {renaming && (
        <RenameDialog
          open={!!renaming}
          initialName={renaming.name}
          onClose={() => setRenaming(null)}
          onRename={(name) => handleRename(renaming.id, name)}
        />
      )}
      {deleting && (
        <DeleteDialog
          open={!!deleting}
          name={deleting.name}
          onClose={() => setDeleting(null)}
          onConfirm={() => handleDelete(deleting.id)}
        />
      )}
    </div>
  );
}
