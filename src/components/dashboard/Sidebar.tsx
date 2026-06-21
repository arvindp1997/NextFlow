"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { UserButton } from "@clerk/nextjs";
import {
  Sparkles,
  Workflow,
  PanelLeftClose,
  PanelLeftOpen,
} from "lucide-react";
import { cn } from "@/lib/utils";

const STORAGE_KEY = "nextflow-sidebar-collapsed";

export function Sidebar({
  defaultCollapsed = false,
  persist = true,
}: {
  // Initial collapsed state. On the dashboard this is left at the default
  // (false) and the real starting value comes from localStorage below. In
  // the canvas we pass true so the sidebar always starts collapsed there,
  // regardless of whatever the dashboard's own preference is.
  defaultCollapsed?: boolean;
  // Whether toggling persists to the shared localStorage key. Off for the
  // canvas, so temporarily expanding it there doesn't change the dashboard's
  // separate remembered preference.
  persist?: boolean;
}) {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(defaultCollapsed);

  useEffect(() => {
    if (!persist) return;
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === "1") setCollapsed(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function toggle() {
    setCollapsed((v) => {
      if (persist) localStorage.setItem(STORAGE_KEY, v ? "0" : "1");
      return !v;
    });
  }

  const flowActive = pathname === "/dashboard";

  return (
    <aside
      className={cn(
        "flex flex-col border-r border-border bg-gray-200 py-5 transition-all",
        collapsed ? "w-16 px-2" : "w-[280px] px-4",
      )}
    >
      <div
        className={cn(
          "mb-8 flex items-center px-2",
          collapsed ? "flex-col gap-3" : "justify-between gap-2",
        )}
      >
        <div className="flex items-center gap-2">
         {!collapsed && <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-zinc-900 text-white">
            <Sparkles size={15} />
          </div> } 
          {!collapsed && (
            <span className="text-lg font-semibold text-zinc-900">
              NextFlow
            </span>
          )}
        </div>
        <button
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-zinc-700"
          onClick={toggle}
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        >
          {collapsed ? (
            <PanelLeftOpen strokeWidth={2.5} size={18} />
          ) : (
            <PanelLeftClose size={18} strokeWidth={2.5} />
          )}
        </button>
      </div>

      <nav className="flex-1 space-y-1">
        <a
          href="/dashboard"
          className={cn(
            "flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-light",
            flowActive
              ? "bg-zinc-300 text-zinc-900"
              : "text-zinc-500 hover:bg-zinc-50 hover:text-zinc-700",
            collapsed && "justify-center px-0",
          )}
          title="Flow"
        >
          <Workflow size={16} className="shrink-0" />
          {!collapsed && "Flow"}
        </a>
      </nav>

      <div
        className={cn(
          "border-t border-border pt-4 flex justify-center",
          collapsed && "text-center",
        )}
      >
        <UserButton afterSignOutUrl="/sign-in" showName={!collapsed} />
      </div>
    </aside>
  );
}
