"use client";

import { useState } from "react";
import { Dialog } from "@/components/ui/Dialog";
import { Button } from "@/components/ui/Button";

export function RenameDialog({
  open,
  initialName,
  onClose,
  onRename,
}: {
  open: boolean;
  initialName: string;
  onClose: () => void;
  onRename: (name: string) => Promise<void>;
}) {
  const [name, setName] = useState(initialName);
  const [submitting, setSubmitting] = useState(false);

  async function submit() {
    if (!name.trim()) return;
    setSubmitting(true);
    await onRename(name.trim());
    setSubmitting(false);
  }

  return (
    <Dialog open={open} onClose={onClose} title="Rename workflow">
      <input
        autoFocus
        className="w-full rounded-lg border border-border px-3 py-2 text-sm outline-none focus:border-zinc-400"
        value={name}
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && submit()}
      />
      <div className="mt-4 flex justify-end gap-2">
        <Button variant="secondary" onClick={onClose}>
          Cancel
        </Button>
        <Button onClick={submit} disabled={submitting}>
          {submitting ? "Saving…" : "Save"}
        </Button>
      </div>
    </Dialog>
  );
}
