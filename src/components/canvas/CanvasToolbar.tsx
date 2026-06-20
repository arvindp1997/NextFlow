"use client";

import { useState, useRef, useEffect } from "react";
import { useReactFlow, useViewport } from "@xyflow/react";
import { Undo2, Redo2, Command, Minus, Plus as PlusIcon, Maximize2, LayoutGrid, Move } from "lucide-react";
import { useWorkflowStore } from "@/store/workflowStore";
import { cn } from "@/lib/utils";

/**
 * Bottom-left zoom/history controls pill. The "add node" chip and the
 * minimap toggle are separate, independently-positioned pieces — see
 * AddNodeChip and the minimap toggle button rendered directly in
 * WorkflowCanvas.tsx — matching the reference's three-piece bottom layout
 * rather than one combined toolbar.
 */
export function CanvasToolbar({ selectionMode, onToggleSelectionMode }: { selectionMode: boolean; onToggleSelectionMode: () => void }) {
  const { zoomIn, zoomOut, fitView } = useReactFlow();
  const { zoom } = useViewport();
  const undo = useWorkflowStore((s) => s.undo);
  const redo = useWorkflowStore((s) => s.redo);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const shortcutsRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onClickAway(e: MouseEvent) {
      if (shortcutsRef.current && !shortcutsRef.current.contains(e.target as Node)) setShortcutsOpen(false);
    }
    document.addEventListener("mousedown", onClickAway);
    return () => document.removeEventListener("mousedown", onClickAway);
  }, []);

  return (
    <div className="absolute bottom-6 left-6 z-20 flex items-center gap-0.5 rounded-xl border border-border bg-white px-1.5 py-1.5 shadow-lg">
      <ToolbarButton onClick={undo} icon={<Undo2 size={15} />} label="Undo" />
      <ToolbarButton onClick={redo} icon={<Redo2 size={15} />} label="Redo" />
      <Divider />
      <div className="relative" ref={shortcutsRef}>
        <ToolbarButton onClick={() => setShortcutsOpen((v) => !v)} icon={<Command size={15} />} label="Keyboard shortcuts" active={shortcutsOpen} />
        {shortcutsOpen && (
          <div className="absolute bottom-11 left-0 w-56 rounded-xl border border-border bg-white p-3 text-xs shadow-xl">
            <p className="mb-2 font-semibold text-zinc-700">Keyboard shortcuts</p>
            <ShortcutRow keys="⌘ Z" label="Undo" />
            <ShortcutRow keys="⌘ ⇧ Z" label="Redo" />
            <ShortcutRow keys="Delete" label="Delete selection" />
          </div>
        )}
      </div>
      <Divider />
      <ToolbarButton onClick={() => zoomOut()} icon={<Minus size={15} />} label="Zoom out" />
      <span className="w-10 select-none text-center text-[11px] font-medium text-zinc-500">{Math.round(zoom * 100)}%</span>
      <ToolbarButton onClick={() => zoomIn()} icon={<PlusIcon size={15} />} label="Zoom in" />
      <ToolbarButton onClick={() => fitView({ duration: 200 })} icon={<Maximize2 size={15} />} label="Fit view" />
      <Divider />
      {/* Superseded by the standalone minimap toggle button next to the
          minimap itself (bottom-right) — kept here, disabled, rather than
          removed, per instruction. */}
      <ToolbarButton onClick={() => {}} icon={<LayoutGrid size={15} />} label="Minimap toggle moved to bottom-right" disabled />
      <ToolbarButton onClick={onToggleSelectionMode} icon={<Move size={15} />} label="Selection mode (drag to multi-select)" active={selectionMode} />
    </div>
  );
}

function ToolbarButton({
  onClick,
  icon,
  label,
  active,
  disabled,
}: {
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
  active?: boolean;
  disabled?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={label}
      className={cn(
        "flex h-8 w-8 items-center justify-center rounded-full transition-colors",
        disabled ? "cursor-not-allowed text-zinc-300" : active ? "bg-zinc-900 text-white" : "text-zinc-500 hover:bg-zinc-100 hover:text-zinc-700"
      )}
    >
      {icon}
    </button>
  );
}

function Divider() {
  return <div className="mx-0.5 h-5 w-px shrink-0 bg-border" />;
}

function ShortcutRow({ keys, label }: { keys: string; label: string }) {
  return (
    <div className="flex items-center justify-between py-0.5">
      <span className="text-zinc-500">{label}</span>
      <kbd className="rounded border border-border bg-zinc-50 px-1.5 py-0.5 font-mono text-[10px] text-zinc-600">{keys}</kbd>
    </div>
  );
}