"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { Plus, Upload, Search } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Sidebar } from "@/components/dashboard/Sidebar";
import { WorkflowCard } from "@/components/dashboard/WorkflowCard";
import { WorkflowThumbnail } from "@/components/dashboard/WorkflowThumbnail";
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
  const [search, setSearch] = useState("");
  const [importing, setImporting] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);
  const importInputRef = useRef<HTMLInputElement>(null);

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

  async function handleImportFile(file: File | undefined) {
    if (!file) return;
    setImporting(true);
    setImportError(null);
    try {
      const text = await file.text();
      let parsed: { name?: string; nodes?: unknown; edges?: unknown };
      try {
        parsed = JSON.parse(text);
      } catch {
        setImportError(`"${file.name}" isn't valid JSON.`);
        return;
      }
      if (!Array.isArray(parsed.nodes) || !Array.isArray(parsed.edges)) {
        setImportError(`"${file.name}" doesn't look like an exported workflow (missing nodes/edges).`);
        return;
      }
      const res = await fetch("/api/workflows", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: parsed.name ?? file.name.replace(/\.json$/i, ""), nodes: parsed.nodes, edges: parsed.edges }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        setImportError(typeof body?.error === "string" ? body.error : "Import failed — the server rejected the workflow.");
        return;
      }
      const { workflow } = await res.json();
      setWorkflows((prev) => [
        { id: workflow.id, name: workflow.name, status: workflow.status, lastEditedAt: workflow.lastEditedAt, createdAt: workflow.createdAt },
        ...prev,
      ]);
    } catch (err) {
      console.error("Failed to import workflow:", err);
      setImportError("Something went wrong reading that file.");
    } finally {
      setImporting(false);
      if (importInputRef.current) importInputRef.current.value = "";
    }
  }

  async function handleDuplicate(id: string) {
    const res = await fetch(`/api/workflows/${id}/duplicate`, { method: "POST" });
    if (!res.ok) return;
    const { workflow } = await res.json();
    setWorkflows((prev) => [
      { id: workflow.id, name: workflow.name, status: workflow.status, lastEditedAt: workflow.lastEditedAt, createdAt: workflow.createdAt },
      ...prev,
    ]);
  }

  async function handleExportJson(w: WorkflowSummary) {
    const res = await fetch(`/api/workflows/${w.id}`);
    if (!res.ok) return;
    const { workflow } = await res.json();
    const data = JSON.stringify({ name: workflow.name, nodes: workflow.nodes, edges: workflow.edges }, null, 2);
    const blob = new Blob([data], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${workflow.name.replace(/\s+/g, "-").toLowerCase()}.json`;
    a.click();
    URL.revokeObjectURL(url);
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

  const filteredWorkflows = search.trim()
    ? workflows.filter((w) => w.name.toLowerCase().includes(search.trim().toLowerCase()))
    : workflows;

  return (
    <div className="flex min-h-screen bg-canvas">
      <Sidebar />
      <main className="flex-1 px-8 py-8">
        <div className="mx-auto max-w-5xl">
          <div className="mb-8 flex items-start justify-between">
            <div>
              <h1 className="text-xl font-semibold text-zinc-900">Flow</h1>
              <p className="mt-1 text-sm text-zinc-500">Build workflows or run models directly</p>
            </div>
            <div className="flex flex-col items-end gap-1.5">
              <div className="flex items-center gap-2">
                <input
                  ref={importInputRef}
                  type="file"
                  accept="application/json"
                  className="hidden"
                  onChange={(e) => handleImportFile(e.target.files?.[0])}
                />
                <Button variant="secondary" size="sm" disabled={importing} onClick={() => importInputRef.current?.click()}>
                  <Upload size={14} /> {importing ? "Importing…" : "Import"}
                </Button>
                <Button size="sm" className="w-9 px-0" onClick={() => setCreating(true)} aria-label="New workflow">
                  <Plus size={15} />
                </Button>
              </div>
              {importError && <p className="max-w-xs text-right text-xs text-red-600">{importError}</p>}
            </div>
          </div>

          <section className="mb-10">
            <h2 className="text-sm font-semibold text-zinc-900">System Workflows</h2>
            <p className="mt-1 text-xs text-zinc-500">Prebuilt workflow templates - click to open and start using.</p>
            <button
              className="mt-4 w-72 cursor-pointer overflow-hidden rounded-2xl border border-border bg-white text-left shadow-node transition-shadow hover:shadow-node-selected"
              onClick={() => handleCreate("Product Marketing Pipeline (Sample)", "sample")}
            >
              <WorkflowThumbnail />
              <div className="border-t border-border px-3 py-2.5">
                <span className="text-sm font-semibold text-zinc-900">Product Marketing Pipeline</span>
              </div>
            </button>
          </section>

          <section>
            <div className="flex items-end justify-between">
              <div>
                <h2 className="text-sm font-semibold text-zinc-900">Your Workflows</h2>
                <p className="mt-1 text-xs text-zinc-500">Open one to edit, run, and review history.</p>
              </div>
              <div className="relative w-64">
                <Search size={14} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-zinc-400" />
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search workflows…"
                  className="w-full rounded-lg border border-border bg-white py-1.5 pl-8 pr-3 text-sm text-zinc-700 outline-none focus:border-zinc-400"
                />
              </div>
            </div>

            <div className="mt-4">
              {workflows.length === 0 ? (
                <EmptyState onCreate={() => setCreating(true)} />
              ) : filteredWorkflows.length === 0 ? (
                <p className="text-sm text-zinc-400">No workflows match &ldquo;{search}&rdquo;.</p>
              ) : (
                <div className="flex flex-wrap gap-4">
                  {filteredWorkflows.map((w) => (
                    <WorkflowCard
                      key={w.id}
                      workflow={w}
                      onOpen={() => router.push(`/workflow/${w.id}`)}
                      onRename={() => setRenaming(w)}
                      onDuplicate={() => handleDuplicate(w.id)}
                      onExport={() => handleExportJson(w)}
                      onDelete={() => setDeleting(w)}
                    />
                  ))}
                </div>
              )}
            </div>
          </section>
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