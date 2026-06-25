"use client";

import { useState, useRef, useEffect } from "react";
import { MoreHorizontal, Pencil, Trash2, ExternalLink, Copy, Download, Loader2 } from "lucide-react";
import { WorkflowThumbnail } from "@/components/dashboard/WorkflowThumbnail";
import { formatRelativeTime } from "@/lib/utils";
import type { WorkflowSummary } from "@/lib/types";

export function WorkflowCard({
  workflow,
  onOpen,
  onRename,
  onDuplicate,
  onExport,
  onDelete,
}: {
  workflow: WorkflowSummary;
  onOpen: () => void;
  onRename: () => void;
  onDuplicate: () => void;
  onExport: () => void;
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
      className="group relative w-72 cursor-pointer rounded-2xl border border-border bg-canvas  transition-shadow hover:shadow-card-selected"
      onClick={onOpen}
    >
      <div className="overflow-hidden rounded-t-2xl">
        <WorkflowThumbnail />
      </div>

      {/* Positioned relative to the outer card (not the thumbnail wrapper above,
          which clips for the image's rounded corners) so the dropdown can
          render outside the card's bounds instead of being cut off. */}
      <div className="absolute right-2 top-2" ref={menuRef}>
        <button
          className="flex h-7 w-7 items-center justify-center rounded-md bg-white/90 text-zinc-500 opacity-0 shadow-sm backdrop-blur transition-opacity hover:bg-white hover:text-zinc-700 group-hover:opacity-100"
          onClick={(e) => {
            e.stopPropagation();
            setMenuOpen((v) => !v);
          }}
          aria-label="Workflow actions"
        >
          <MoreHorizontal size={16} />
        </button>
        {menuOpen && (
          <div className="absolute right-0 z-10 mt-1 w-40 rounded-xl border border-border bg-white py-1.5 shadow-lg">
            <MenuItem icon={<ExternalLink size={14} />} label="Open" onClick={onOpen} />
            <MenuItem icon={<Pencil size={14} />} label="Rename" onClick={onRename} />
            <MenuItem icon={<Copy size={14} />} label="Duplicate" onClick={onDuplicate} />
            <MenuItem icon={<Download size={14} />} label="Export JSON" onClick={onExport} />
            <div className="my-1 border-t border-border" />
            <MenuItem icon={<Trash2 size={14} />} label="Delete" onClick={onDelete} danger />
          </div>
        )}
      </div>

      <div className="rounded-b-2xl border-t border-border px-3 py-2.5">
        <div className="flex items-center justify-between gap-2">
          <h3 className="min-w-0 truncate text-sm font-semibold text-zinc-900">{workflow.name}</h3>
          {workflow.status === "RUNNING" && (
            <span className="flex shrink-0 items-center gap-1 rounded-md bg-purple-50 px-1.5 py-0.5 text-[10px] font-medium text-gray-600">
              <Loader2 size={9} className="animate-spin" /> Running
            </span>
          )}
           {workflow.status === "IDLE" && (
            <span className="flex shrink-0 items-center gap-1 rounded-md bg-purple-50 px-1.5 py-0.5 text-[10px] font-medium text-gray-600">
               Idle
            </span>
          )}
        </div>

        <span className="text-xs text-zinc-400">Edited {formatRelativeTime(workflow.lastEditedAt)}</span>
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
      className={`flex w-full items-center gap-2.5 px-3.5 py-2 text-left text-[13px] hover:bg-zinc-50 ${
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