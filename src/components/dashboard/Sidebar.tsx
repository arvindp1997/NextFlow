"use client";

import { useEffect, useState } from "react";
import { UserButton } from "@clerk/nextjs";
import { Sparkles, Workflow, PanelLeftClose, PanelLeftOpen } from "lucide-react";
import { cn } from "@/lib/utils";

const STORAGE_KEY = "nextflow-sidebar-collapsed";

export function Sidebar() {
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === "1") setCollapsed(true);
  }, []);

  function toggle() {
    setCollapsed((v) => {
      localStorage.setItem(STORAGE_KEY, v ? "0" : "1");
      return !v;
    });
  }

  return (
    <aside className={cn("flex flex-col border-r border-border bg-gray-200 py-5 transition-all", collapsed ? "w-16 px-2" : "w-60 px-4")}>
      <div className={cn("mb-8 flex items-center px-2", collapsed ? "flex-col gap-3" : "justify-between gap-2")}>
        <div className="flex items-center gap-2">
          <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-zinc-900 text-white">
            <Sparkles size={15} />
          </div>
          {!collapsed && <span className="text-sm font-semibold text-zinc-900">NextFlow</span>}
        </div>
        <button
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-zinc-400 hover:bg-zinc-100 hover:text-zinc-600"
          onClick={toggle}
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        >
          {collapsed ? <PanelLeftOpen size={15} /> : <PanelLeftClose size={15} />}
        </button>
      </div>

      <nav className="flex-1 space-y-1">
        <a
          href="/dashboard"
          className={cn(
            "flex items-center gap-2.5 rounded-lg bg-zinc-300 px-3 py-2 text-sm font-medium text-zinc-900",
            collapsed && "justify-center px-0"
          )}
          title="Flow"
        >
          <Workflow size={16} className="shrink-0" />
          {!collapsed && "Flow"}
        </a>
      </nav>

      <div className={cn("border-t border-border pt-4", collapsed && "flex justify-center")}>
        <UserButton afterSignOutUrl="/sign-in" showName={!collapsed} />
      </div>
    </aside>
  );
}