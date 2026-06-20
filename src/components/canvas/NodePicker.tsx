"use client";

import { useState, useRef, useEffect } from "react";
import { Plus, Search, Crop, Sparkles, Clock, ImageIcon, Video, AudioLines, FolderClosed } from "lucide-react";
import { useWorkflowStore } from "@/store/workflowStore";
import { Tooltip } from "./Tooltip"; 
import { cn } from "@/lib/utils";

type Category = "Recent" | "Image" | "Video" | "Audio" | "Others";

interface PickerItem {
  id: "crop-image" | "gemini";
  label: string;
  description: string;
  category: Category;
  icon: React.ReactNode;
}

const ITEMS: PickerItem[] = [
  { id: "crop-image", label: "Crop Image", description: "Crop an image by percentage rect", category: "Image", icon: <Crop size={15} /> },
  { id: "gemini", label: "Gemini 3.1 Pro", description: "Generate text with Google Gemini", category: "Others", icon: <Sparkles size={15} /> },
];

const CATEGORIES: { key: Category; icon: React.ReactNode }[] = [
  { key: "Recent", icon: <Clock size={13} /> },
  { key: "Image", icon: <ImageIcon size={13} /> },
  { key: "Video", icon: <Video size={13} /> },
  { key: "Audio", icon: <AudioLines size={13} /> },
  { key: "Others", icon: <FolderClosed size={13} /> },
];

export function NodePicker({ getDropPosition }: { getDropPosition: () => { x: number; y: number } }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<Category>("Recent");
  const addNode = useWorkflowStore((s) => s.addNode);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onClickAway(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onClickAway);
    return () => document.removeEventListener("mousedown", onClickAway);
  }, []);

  const filtered = ITEMS.filter((item) => {
    const matchesQuery = item.label.toLowerCase().includes(query.toLowerCase());
    const matchesCategory = query ? true : category === "Recent" || item.category === category;
    return matchesQuery && matchesCategory;
  });

  function handleAdd(item: PickerItem) {
    addNode(item.id, getDropPosition());
    setOpen(false);
    setQuery("");
  }

  return (
    <div ref={ref} className="relative">
      {open && (
        <div className="absolute bottom-12 left-1/2 z-20 w-72 -translate-x-1/2 overflow-hidden rounded-2xl border border-border bg-white shadow-xl">
          <div className="flex items-center gap-2 border-b border-border px-3 py-2">
            <Search size={14} className="text-zinc-400" />
            <input
              autoFocus
              className="flex-1 bg-transparent text-sm outline-none placeholder:text-zinc-400"
              placeholder="Search nodes…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>

          <div className="flex gap-1 border-b border-border px-2 py-1.5">
            {CATEGORIES.map((c) => (
              <button
                key={c.key}
                onClick={() => setCategory(c.key)}
                className={cn(
                  "flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-medium",
                  category === c.key && !query ? "bg-zinc-100 text-zinc-900" : "text-zinc-500 hover:bg-zinc-50"
                )}
              >
                {c.icon}
                {c.key}
              </button>
            ))}
          </div>

          <div className="max-h-64 overflow-y-auto py-1">
            {filtered.length === 0 ? (
              <p className="px-3 py-4 text-center text-xs text-zinc-400">No nodes found</p>
            ) : (
              filtered.map((item) => (
                <button
                  key={item.id}
                  onClick={() => handleAdd(item)}
                  className="flex w-full items-start gap-2.5 px-3 py-2 text-left hover:bg-zinc-50"
                >
                  <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-zinc-100 text-zinc-600">
                    {item.icon}
                  </span>
                  <span>
                    <span className="block text-sm font-medium text-zinc-800">{item.label}</span>
                    <span className="block text-xs text-zinc-400">{item.description}</span>
                  </span>
                </button>
              ))
            )}
          </div>
        </div>
      )}

      <Tooltip label="Add node">
        <button
          onClick={() => setOpen((v) => !v)}
          className="flex h-8 w-8 items-center justify-center rounded-full text-zinc-500 hover:bg-zinc-100 hover:text-zinc-700"
          aria-label="Add node"
        >
          <Plus size={16} />
        </button>
      </Tooltip>
    </div>
  );
}