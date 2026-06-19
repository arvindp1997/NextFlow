import { UserButton } from "@clerk/nextjs";
import { LayoutGrid, Sparkles } from "lucide-react";

export function Sidebar() {
  return (
    <aside className="flex w-60 flex-col border-r border-border bg-white px-4 py-5">
      <div className="mb-8 flex items-center gap-2 px-2">
        <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-zinc-900 text-white">
          <Sparkles size={15} />
        </div>
        <span className="text-sm font-semibold text-zinc-900">NextFlow</span>
      </div>

      <nav className="flex-1 space-y-1">
        <a
          href="/dashboard"
          className="flex items-center gap-2.5 rounded-lg bg-zinc-100 px-3 py-2 text-sm font-medium text-zinc-900"
        >
          <LayoutGrid size={16} />
          Workflows
        </a>
      </nav>

      <div className="border-t border-border pt-4">
        <UserButton afterSignOutUrl="/sign-in" showName />
      </div>
    </aside>
  );
}
