import { Workflow } from "lucide-react";

/**
 * Decorative placeholder shown in workflow/template cards. The reference UI
 * shows real photography per-workflow, which would need an actual thumbnail
 * generation pipeline (rendering the canvas to an image) that doesn't exist
 * here — this is a simple gradient + icon stand-in instead.
 */
export function WorkflowThumbnail({ className = "" }: { className?: string }) {
  return (
    <div className={`flex aspect-video w-full items-center justify-center bg-gradient-to-br from-indigo-500 via-violet-500 to-fuchsia-500 ${className}`}>
      <Workflow size={28} className="text-white/70" />
    </div>
  );
}