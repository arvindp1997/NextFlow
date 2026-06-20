import { Info } from "lucide-react";
import { cn } from "@/lib/utils";

interface TooltipProps {
  text: string;
  className?: string;
}

export function Tooltip({ text, className }: TooltipProps) {
  return (
    <div className={cn("group relative inline-flex", className)}>
      <Info
        size={11}
        className="cursor-help text-zinc-400 transition-colors hover:text-zinc-500"
      />

      <div
        className="
          pointer-events-none absolute bottom-full left-1/2 z-50 mb-2
          hidden -translate-x-1/2 rounded-md bg-white px-2 py-1
          text-xs whitespace-nowrap text-black shadow-lg
          group-hover:block
        "
      >
        {text}
      </div>
    </div>
  );
}