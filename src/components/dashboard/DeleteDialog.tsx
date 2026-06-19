"use client";

import { useState } from "react";
import { Dialog } from "@/components/ui/Dialog";
import { Button } from "@/components/ui/Button";

export function DeleteDialog({
  open,
  name,
  onClose,
  onConfirm,
}: {
  open: boolean;
  name: string;
  onClose: () => void;
  onConfirm: () => Promise<void>;
}) {
  const [submitting, setSubmitting] = useState(false);

  async function submit() {
    setSubmitting(true);
    await onConfirm();
    setSubmitting(false);
  }

  return (
    <Dialog open={open} onClose={onClose} title="Delete workflow">
      <p className="text-sm text-zinc-600">
        Delete <span className="font-medium text-zinc-900">{name}</span>? This permanently removes the workflow and
        its run history.
      </p>
      <div className="mt-4 flex justify-end gap-2">
        <Button variant="secondary" onClick={onClose}>
          Cancel
        </Button>
        <Button variant="danger" onClick={submit} disabled={submitting}>
          {submitting ? "Deleting…" : "Delete"}
        </Button>
      </div>
    </Dialog>
  );
}
