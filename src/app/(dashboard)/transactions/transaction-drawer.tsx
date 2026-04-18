"use client";

import { useState, useEffect } from "react";
import { format, parseISO } from "date-fns";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { MerchantLogo } from "@/components/ui/merchant-logo";
import { CategoryIcon } from "@/components/ui/category-icon";
import { toast } from "sonner";
import { fetchJson, FetchError, formatCurrency } from "@/lib/fetcher";
import { Scissors, Link2, Unlink, Trash2, ArrowRightLeft } from "lucide-react";

interface Category {
  id: string;
  name: string;
  color: string;
  icon?: string | null;
}

interface Transaction {
  id: string;
  date: string;
  description: string;
  merchant: string | null;
  amount: number;
  isCredit: boolean;
  isPending: boolean;
  isReconciled: boolean;
  source: string;
  notes: string | null;
  category: Category | null;
  account: { id: string; name: string; type: string };
  transferPairId: string | null;
  transferPair: { account: { id: string; name: string } } | null;
  splits: Array<{ id: string; amount: number; note: string | null; categoryId: string | null; category: Category | null }>;
}

interface TransactionDrawerProps {
  tx: Transaction | null;
  onClose: () => void;
  categories: Category[];
  onChanged: () => void;
  onSplit: (tx: Transaction) => void;
  onLinkTransfer: (tx: Transaction) => void;
  onUnlinkTransfer: (txId: string) => void;
  onDelete: (txId: string) => void;
}

export function TransactionDrawer({
  tx,
  onClose,
  categories,
  onChanged,
  onSplit,
  onLinkTransfer,
  onUnlinkTransfer,
  onDelete,
}: TransactionDrawerProps) {
  const [form, setForm] = useState({
    merchant: "",
    amount: "",
    date: "",
    notes: "",
    categoryId: "",
  });
  const [learn, setLearn] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!tx) return;
    setForm({
      merchant: tx.merchant ?? tx.description,
      amount: tx.amount.toFixed(2),
      date: format(parseISO(tx.date), "yyyy-MM-dd"),
      notes: tx.notes ?? "",
      categoryId: tx.category?.id ?? "none",
    });
    setLearn(true); // default back on each open
  }, [tx?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!tx) return null;

  const isOpen = !!tx;
  const hasSplits = tx.splits.length >= 2;

  async function handleSave() {
    if (!tx) return;
    setSaving(true);
    try {
      await fetchJson(`/api/transactions/${tx.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          merchant: form.merchant,
          description: form.merchant,
          amount: parseFloat(form.amount),
          date: form.date,
          notes: form.notes || null,
          categoryId: form.categoryId === "none" ? null : form.categoryId,
          learn,
        }),
      });
      toast.success("Saved");
      onChanged();
      onClose();
    } catch (e) {
      toast.error(e instanceof FetchError ? e.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  }

  // Gifts / Other / Transfers are auto-skipped by the server — show a hint
  // so the user knows the "Remember" checkbox is irrelevant for those.
  const chosenCategoryName =
    form.categoryId === "none"
      ? null
      : categories.find((c) => c.id === form.categoryId)?.name ?? null;
  const autoSkipped = chosenCategoryName
    ? ["Gifts", "Other", "Transfers"].includes(chosenCategoryName)
    : false;

  return (
    <Sheet open={isOpen} onOpenChange={(o) => { if (!o) onClose(); }}>
      <SheetContent side="right" className="sm:max-w-md w-full overflow-y-auto">
        <SheetHeader className="pb-4">
          <div className="flex items-center gap-3">
            <MerchantLogo merchant={form.merchant || tx.description} fallbackColor={tx.category?.color} size="md" />
            <div className="min-w-0">
              <SheetTitle className="text-lg truncate">{form.merchant || tx.description}</SheetTitle>
              <p className="text-xs text-gray-400 dark:text-gray-500">
                {format(parseISO(tx.date), "EEE d MMM yyyy")} · {tx.account.name}
              </p>
            </div>
          </div>
        </SheetHeader>

        <div className="px-4 pb-6 space-y-5">
          {/* Amount */}
          <div className="flex items-baseline justify-between pb-3 border-b border-gray-100 dark:border-gray-800">
            <span className="text-sm text-gray-500 dark:text-gray-400">Amount</span>
            <span className={`text-2xl font-bold ${tx.isCredit ? "text-emerald-600" : "text-gray-900 dark:text-gray-100"}`}>
              {tx.isCredit ? "+" : "−"}{formatCurrency(tx.amount)}
            </span>
          </div>

          {/* Status badges */}
          <div className="flex flex-wrap gap-1.5">
            {tx.isPending && !tx.isReconciled && (
              <Badge className="bg-amber-100 text-amber-700 border-amber-200">Pending</Badge>
            )}
            {tx.isReconciled && (
              <Badge className="bg-green-100 text-green-700 border-green-200">Reconciled</Badge>
            )}
            {tx.source && (
              <Badge variant="outline" className="capitalize">{tx.source}</Badge>
            )}
          </div>

          {/* Editable fields */}
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Merchant</Label>
              <Input
                value={form.merchant}
                onChange={(e) => setForm((f) => ({ ...f, merchant: e.target.value }))}
              />
              {tx.description !== form.merchant && (
                <p className="text-xs text-gray-400 dark:text-gray-500 truncate">Raw: {tx.description}</p>
              )}
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs">Amount</Label>
                <Input
                  type="number"
                  step="0.01"
                  value={form.amount}
                  onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))}
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Date</Label>
                <Input
                  type="date"
                  value={form.date}
                  onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))}
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs">Category</Label>
              <Select
                value={form.categoryId}
                onValueChange={(v) => setForm((f) => ({ ...f, categoryId: v ?? "none" }))}
              >
                <SelectTrigger>
                  <SelectValue>
                    {form.categoryId === "none" ? (
                      <span className="text-gray-400 dark:text-gray-500">— Uncategorized</span>
                    ) : (
                      categories.find((c) => c.id === form.categoryId)?.name ?? "—"
                    )}
                  </SelectValue>
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

              {form.categoryId !== "none" && form.categoryId !== (tx.category?.id ?? "") && (
                <label
                  className={`flex items-start gap-2 mt-2 text-xs cursor-pointer ${
                    autoSkipped ? "opacity-60" : ""
                  }`}
                >
                  <input
                    type="checkbox"
                    className="mt-0.5 h-3.5 w-3.5 rounded border-gray-300 dark:border-gray-700 accent-indigo-600"
                    checked={learn && !autoSkipped}
                    disabled={autoSkipped}
                    onChange={(e) => setLearn(e.target.checked)}
                  />
                  <span className="text-gray-600 dark:text-gray-300">
                    {autoSkipped ? (
                      <>
                        <strong>One-off only</strong> — {chosenCategoryName} is always a one-off (no rule created).
                      </>
                    ) : (
                      <>
                        Remember <strong>{form.merchant || tx.description}</strong> → {chosenCategoryName} for future uploads.{" "}
                        <span className="text-gray-400 dark:text-gray-500">Uncheck for a one-off.</span>
                      </>
                    )}
                  </span>
                </label>
              )}
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs">Notes</Label>
              <Textarea
                value={form.notes}
                onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
                placeholder="Add a note…"
                className="min-h-[70px]"
              />
            </div>
          </div>

          {/* Splits */}
          {hasSplits && (
            <div className="space-y-2 pt-2 border-t border-gray-100 dark:border-gray-800">
              <p className="text-xs font-medium text-gray-700 dark:text-gray-200">Splits</p>
              {tx.splits.map((s) => (
                <div key={s.id} className="flex items-center gap-2 text-sm">
                  {s.category && <CategoryIcon icon={s.category.icon} color={s.category.color} size="sm" />}
                  <span className="flex-1 truncate">{s.category?.name ?? "Uncategorized"}</span>
                  <span className="text-gray-400 dark:text-gray-500 text-xs truncate">{s.note}</span>
                  <span className="font-medium">{formatCurrency(s.amount)}</span>
                </div>
              ))}
            </div>
          )}

          {/* Transfer link */}
          {tx.transferPairId && tx.transferPair && (
            <div className="text-xs text-gray-500 dark:text-gray-400 pt-2 border-t border-gray-100 dark:border-gray-800 flex items-center gap-2">
              <ArrowRightLeft className="w-3.5 h-3.5 text-blue-500" />
              Transfer paired with <strong>{tx.transferPair.account.name}</strong>
            </div>
          )}

          {/* Actions */}
          <div className="flex flex-wrap gap-2 pt-3 border-t border-gray-100 dark:border-gray-800">
            <Button size="sm" variant="outline" onClick={() => onSplit(tx)}>
              <Scissors className="w-3.5 h-3.5 mr-1.5" /> {hasSplits ? "Edit split" : "Split"}
            </Button>
            {tx.transferPairId ? (
              <Button size="sm" variant="outline" onClick={() => onUnlinkTransfer(tx.id)}>
                <Unlink className="w-3.5 h-3.5 mr-1.5" /> Unlink transfer
              </Button>
            ) : (
              <Button size="sm" variant="outline" onClick={() => onLinkTransfer(tx)}>
                <Link2 className="w-3.5 h-3.5 mr-1.5" /> Link transfer
              </Button>
            )}
            <Button
              size="sm"
              variant="outline"
              className="text-red-500 hover:text-red-600 ml-auto"
              onClick={() => onDelete(tx.id)}
            >
              <Trash2 className="w-3.5 h-3.5 mr-1.5" /> Delete
            </Button>
          </div>

          {/* Save */}
          <div className="flex gap-2 pt-2">
            <Button variant="outline" className="flex-1" onClick={onClose} disabled={saving}>
              Cancel
            </Button>
            <Button className="flex-1" onClick={handleSave} disabled={saving}>
              {saving ? "Saving…" : "Save changes"}
            </Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
