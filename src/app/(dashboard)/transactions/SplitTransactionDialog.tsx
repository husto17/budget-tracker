"use client";

import { useState, useEffect } from "react";
import { toast } from "sonner";
import { Plus, Scissors, Trash2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { CategoryIcon } from "@/components/ui/category-icon";
import { formatCurrency } from "@/lib/fetcher";
import type { Transaction, Category } from "./types";

interface Props {
  tx: Transaction | null;
  onClose: () => void;
  onSaved: () => void;
  categories: Category[];
}

type Row = { categoryId: string; amount: string; note: string };

export function SplitTransactionDialog({ tx, onClose, onSaved, categories }: Props) {
  const [rows, setRows] = useState<Row[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!tx) return;
    if (tx.splits && tx.splits.length >= 2) {
      setRows(
        tx.splits.map((s) => ({
          categoryId: s.categoryId ?? "",
          amount: s.amount.toFixed(2),
          note: s.note ?? "",
        })),
      );
    } else {
      setRows([
        { categoryId: "", amount: "", note: "" },
        { categoryId: "", amount: "", note: "" },
      ]);
    }
  }, [tx]);

  async function handleSave() {
    if (!tx) return;
    setSaving(true);
    const splits = rows.map((r) => ({
      categoryId: r.categoryId || null,
      amount: parseFloat(r.amount) || 0,
      note: r.note || undefined,
    }));
    const res = await fetch(`/api/transactions/${tx.id}/splits`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ splits }),
    });
    if (res.ok) {
      toast.success("Transaction split saved");
      onSaved();
      onClose();
    } else {
      const d = await res.json().catch(() => ({}));
      toast.error(d.error ?? "Failed to save split");
    }
    setSaving(false);
  }

  const splitTotal = rows.reduce((s, r) => s + (parseFloat(r.amount) || 0), 0);
  const diff = tx ? Math.abs(splitTotal - tx.amount) : 0;
  const ok = diff <= 0.01;

  return (
    <Dialog open={!!tx} onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Scissors className="w-4 h-4" /> Split Transaction
          </DialogTitle>
        </DialogHeader>
        {tx && (
          <div className="space-y-4">
            <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-3 text-sm">
              <p className="font-medium text-gray-900 dark:text-gray-100">
                {tx.merchant ?? tx.description}
              </p>
              <p className="text-gray-500 dark:text-gray-400 text-xs mt-0.5">
                Total:{" "}
                <span className="font-semibold text-gray-900 dark:text-gray-100">
                  {formatCurrency(tx.amount)}
                </span>
              </p>
            </div>

            <div className="space-y-3">
              {rows.map((row, i) => (
                <div key={i} className="grid grid-cols-[1fr_auto_1fr_auto] gap-2 items-start">
                  <Select
                    value={row.categoryId || "none"}
                    onValueChange={(v) => {
                      const val = v == null || v === "none" ? "" : String(v);
                      setRows((rs) => rs.map((r, idx) => (idx === i ? { ...r, categoryId: val } : r)));
                    }}
                  >
                    <SelectTrigger className="h-8 text-xs">
                      <SelectValue placeholder="Category" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">— None</SelectItem>
                      {categories.map((c) => (
                        <SelectItem key={c.id} value={c.id}>
                          <div className="flex items-center gap-2">
                            <CategoryIcon icon={c.icon} color={c.color} size="sm" />
                            {c.name}
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Input
                    type="number"
                    step="0.01"
                    min="0"
                    value={row.amount}
                    onChange={(e) =>
                      setRows((rs) => rs.map((r, idx) => (idx === i ? { ...r, amount: e.target.value } : r)))
                    }
                    placeholder="0.00"
                    className="h-8 text-xs w-24"
                  />
                  <Input
                    value={row.note}
                    onChange={(e) =>
                      setRows((rs) => rs.map((r, idx) => (idx === i ? { ...r, note: e.target.value } : r)))
                    }
                    placeholder="Note (optional)"
                    className="h-8 text-xs"
                  />
                  {rows.length > 2 ? (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-gray-300 dark:text-gray-600 hover:text-red-500"
                      onClick={() => setRows((rs) => rs.filter((_, idx) => idx !== i))}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  ) : (
                    <div className="w-8" />
                  )}
                </div>
              ))}
            </div>

            <div className={`flex items-center justify-between text-sm px-1 ${ok ? "text-green-600" : "text-red-500"}`}>
              <span>
                Split total: <strong>{formatCurrency(splitTotal)}</strong>
              </span>
              <span>
                {ok
                  ? "✓ Matches"
                  : `${formatCurrency(diff)} ${splitTotal > tx.amount ? "over" : "remaining"}`}
              </span>
            </div>

            <Button
              variant="outline"
              size="sm"
              onClick={() => setRows((rs) => [...rs, { categoryId: "", amount: "", note: "" }])}
              className="w-full"
            >
              <Plus className="w-3.5 h-3.5 mr-1.5" /> Add split
            </Button>
          </div>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={handleSave} disabled={saving || !ok || !tx}>
            {saving ? "Saving..." : "Save splits"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
