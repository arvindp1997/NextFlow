"use client";

import { useState, useRef, useEffect } from "react";
import { MoreHorizontal, Pencil, Trash2, ExternalLink, Loader2 } from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { formatRelativeTime } from "@/lib/utils";
import type { WorkflowSummary } from "@/lib/types";

export function WorkflowCard({
  workflow,
  onOpen,
  onRename,
  onDelete,
}: {
  workflow: WorkflowSummary;
  onOpen: () => void;
  onRename: () => void;
  onDelete: () => void;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onClickAway(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false);
    }
    document.addEventListener("mousedown", onClickAway);
    return () => document.removeEventListener("mousedown", onClickAway);
  }, []);

  return (
    <div
      className="group relative cursor-pointer rounded-2xl border border-border bg-white p-4 shadow-node transition-shadow hover:shadow-node-selected"
      onClick={onOpen}
    >
      <div className="mb-3 flex items-start justify-between">
        <h3 className="truncate pr-6 text-sm font-semibold text-zinc-900">{workflow.name}</h3>
        <div className="relative" ref={menuRef}>
          <button
            className="rounded-md p-1 text-zinc-400 opacity-0 transition-opacity hover:bg-zinc-100 hover:text-zinc-700 group-hover:opacity-100"
            onClick={(e) => {
              e.stopPropagation();
              setMenuOpen((v) => !v);
            }}
            aria-label="Workflow actions"
          >
            <MoreHorizontal size={16} />
          </button>
          {menuOpen && (
            <div className="absolute right-0 z-10 mt-1 w-36 rounded-lg border border-border bg-white py-1 shadow-lg">
              <MenuItem icon={<ExternalLink size={14} />} label="Open" onClick={onOpen} />
              <MenuItem icon={<Pencil size={14} />} label="Rename" onClick={onRename} />
              <MenuItem icon={<Trash2 size={14} />} label="Delete" onClick={onDelete} danger />
            </div>
          )}
        </div>
      </div>

      <div className="flex items-center justify-between">
        <span className="text-xs text-zinc-400">Edited {formatRelativeTime(workflow.lastEditedAt)}</span>
        {workflow.status === "RUNNING" ? (
          <Badge tone="orange">
            <Loader2 size={11} className="animate-spin" /> Running
          </Badge>
        ) : (
          <Badge tone="gray">Idle</Badge>
        )}
      </div>
    </div>
  );
}

function MenuItem({
  icon,
  label,
  onClick,
  danger,
}: {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
  danger?: boolean;
}) {
  return (
    <button
      className={`flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm hover:bg-zinc-50 ${
        danger ? "text-red-600" : "text-zinc-700"
      }`}
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
    >
      {icon}
      {label}
    </button>
  );
}
