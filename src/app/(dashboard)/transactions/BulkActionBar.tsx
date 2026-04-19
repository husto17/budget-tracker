"use client";

import { Tag, Link2, EyeOff, Eye, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { Category } from "./types";

interface Props {
  count: number;
  categories: Category[];
  bulkCatId: string;
  onBulkCatIdChange: (id: string) => void;
  applyingBulk: boolean;
  onApply: () => void;
  bulkLinkEligible: boolean;
  linkingBulk: boolean;
  onLink: () => void;
  onExclude: () => void;
  onDelete: () => void;
  working: boolean;
  onClear: () => void;
}

export function BulkActionBar({
  count,
  categories,
  bulkCatId,
  onBulkCatIdChange,
  applyingBulk,
  onApply,
  bulkLinkEligible,
  linkingBulk,
  onLink,
  onExclude,
  onDelete,
  working,
  onClear,
}: Props) {
  if (count === 0) return null;

  return (
    <div className="fixed bottom-16 md:bottom-0 left-0 right-0 z-50 bg-gray-900 text-white px-4 py-3 flex flex-wrap items-center gap-3 shadow-2xl border-t border-gray-700">
      <span className="text-sm font-semibold tabular-nums">
        {count} selected
      </span>

      {/* Category picker */}
      <div className="flex items-center gap-2">
        <Tag className="w-4 h-4 text-gray-400 shrink-0" />
        <Select value={bulkCatId} onValueChange={(v) => onBulkCatIdChange(v ?? "")}>
          <SelectTrigger className="h-8 bg-gray-800 border-gray-700 text-white text-sm w-44">
            <SelectValue placeholder="Assign category…" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__none__">— None (remove)</SelectItem>
            {categories.map((c) => (
              <SelectItem key={c.id} value={c.id}>
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full" style={{ backgroundColor: c.color }} />
                  {c.name}
                </div>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button
          size="sm"
          disabled={!bulkCatId || applyingBulk}
          onClick={onApply}
          className="bg-blue-600 hover:bg-blue-700 text-white shrink-0"
        >
          {applyingBulk ? "Applying…" : "Apply"}
        </Button>
      </div>

      <div className="flex items-center gap-2">
        {/* Exclude toggle */}
        <Button
          size="sm"
          variant="ghost"
          disabled={working}
          onClick={onExclude}
          className="text-amber-300 hover:text-amber-200 hover:bg-gray-800 gap-1.5 shrink-0"
          title="Exclude selected from totals & charts"
        >
          <EyeOff className="w-3.5 h-3.5" />
          Exclude
        </Button>

        {/* Link as transfer */}
        {bulkLinkEligible && (
          <Button
            size="sm"
            disabled={linkingBulk}
            onClick={onLink}
            className="bg-emerald-600 hover:bg-emerald-700 text-white shrink-0 gap-1"
          >
            <Link2 className="w-3.5 h-3.5" />
            {linkingBulk ? "Linking…" : "Link transfer"}
          </Button>
        )}

        {/* Delete */}
        <Button
          size="sm"
          variant="ghost"
          disabled={working}
          onClick={onDelete}
          className="text-red-400 hover:text-red-300 hover:bg-gray-800 gap-1.5 shrink-0"
        >
          <Trash2 className="w-3.5 h-3.5" />
          Delete
        </Button>
      </div>

      <Button
        size="sm"
        variant="ghost"
        className="text-gray-400 hover:text-white gap-1 ml-auto shrink-0"
        onClick={onClear}
      >
        <X className="w-3.5 h-3.5" />
        Clear
      </Button>
    </div>
  );
}
