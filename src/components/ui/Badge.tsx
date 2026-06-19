import { cn } from "@/lib/utils";

type Tone = "green" | "red" | "yellow" | "gray" | "orange";

const toneClasses: Record<Tone, string> = {
  green: "bg-emerald-50 text-emerald-700 border-emerald-200",
  red: "bg-red-50 text-red-700 border-red-200",
  yellow: "bg-amber-50 text-amber-700 border-amber-200",
  gray: "bg-zinc-100 text-zinc-600 border-zinc-200",
  orange: "bg-orange-50 text-orange-700 border-orange-200",
};

export function Badge({ tone, children }: { tone: Tone; children: React.ReactNode }) {
  return (
    <span className={cn("inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium", toneClasses[tone])}>
      {children}
    </span>
  );
}
