import { Workflow, Plus } from "lucide-react";
import { Button } from "@/components/ui/Button";

export function EmptyState({ onCreate }: { onCreate: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-border-strong bg-white px-6 py-20 text-center">
      <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-zinc-100 text-zinc-400">
        <Workflow size={22} />
      </div>
      <h3 className="text-sm font-semibold text-zinc-900">No workflows yet</h3>
      <p className="mt-1 max-w-xs text-sm text-zinc-500">
        Create your first workflow to start chaining inputs, image edits, and Gemini calls together.
      </p>
      <Button className="mt-5" onClick={onCreate}>
        <Plus size={16} /> Create workflow
      </Button>
    </div>
  );
}
