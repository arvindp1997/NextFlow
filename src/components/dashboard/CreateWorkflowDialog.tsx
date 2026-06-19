"use client";

import { useState } from "react";
import { Dialog } from "@/components/ui/Dialog";
import { Button } from "@/components/ui/Button";

export function CreateWorkflowDialog({
  open,
  onClose,
  onCreate,
}: {
  open: boolean;
  onClose: () => void;
  onCreate: (name: string) => Promise<void>;
}) {
  const [name, setName] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function submit() {
    setSubmitting(true);
    await onCreate(name.trim() || "Untitled Workflow");
    setSubmitting(false);
    setName("");
  }

  return (
    <Dialog open={open} onClose={onClose} title="Create new workflow">
      <input
        autoFocus
        className="w-full rounded-lg border border-border px-3 py-2 text-sm outline-none focus:border-zinc-400"
        placeholder="Workflow name"
        value={name}
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && submit()}
      />
      <div className="mt-4 flex justify-end gap-2">
        <Button variant="secondary" onClick={onClose}>
          Cancel
        </Button>
        <Button onClick={submit} disabled={submitting}>
          {submitting ? "Creating…" : "Create"}
        </Button>
      </div>
    </Dialog>
  );
}
