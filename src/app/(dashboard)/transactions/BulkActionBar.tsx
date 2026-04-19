"use client";

import { Tag, Link2 } from "lucide-react";
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
  onClear: () => void;
}

// Sticky toolbar shown at the bottom when rows are selected. Bumps above the
// mobile bottom-nav (bottom-16) so it doesn't collide.
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
  onClear,
}: Props) {
  if (count === 0) return null;

  return (
    <div className="fixed bottom-16 md:bottom-0 left-0 right-0 z-50 bg-gray-900 text-white px-4 py-3 flex flex-wrap items-center gap-3 shadow-2xl">
      <span className="text-sm font-medium">
        {count} transaction{count !== 1 ? "s" : ""} selected
      </span>
      <div className="flex items-center gap-2 flex-1 min-w-0">
        <Tag className="w-4 h-4 text-gray-400 dark:text-gray-500 shrink-0" />
        <Select value={bulkCatId} onValueChange={(v) => onBulkCatIdChange(v ?? "")}>
          <SelectTrigger className="h-8 bg-gray-800 border-gray-700 text-white text-sm max-w-[200px]">
            <SelectValue placeholder="Pick category..." />
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
          {applyingBulk ? "Applying..." : "Apply"}
        </Button>
      </div>
      {bulkLinkEligible && (
        <Button
          size="sm"
          disabled={linkingBulk}
          onClick={onLink}
          className="bg-emerald-600 hover:bg-emerald-700 text-white shrink-0 gap-1"
        >
          <Link2 className="w-3.5 h-3.5" />
          {linkingBulk ? "Linking..." : "Link as transfer"}
        </Button>
      )}
      <Button
        size="sm"
        variant="ghost"
        className="text-gray-400 dark:text-gray-500 hover:text-white shrink-0"
        onClick={onClear}
      >
        Clear selection
      </Button>
    </div>
  );
}
