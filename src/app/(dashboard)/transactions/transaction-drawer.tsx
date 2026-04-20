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
import { Scissors, Link2, Unlink, Trash2, ArrowRightLeft, HandCoins, Plus, X, Repeat } from "lucide-react";

interface Category {
  id: string;
  name: string;
  color: string;
  icon?: string | null;
}

interface ReimbursementLink {
  id: string;
  amount: number;
  personName: string | null;
  note: string | null;
  settled: boolean;
  reimbursementTx?: { id: string; date: string | Date; merchant: string | null; description: string; amount: number };
  originalTx?: { id: string; date: string | Date; merchant: string | null; description: string; amount: number };
}

interface Tag {
  id: string;
  name: string;
  color: string;
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
  isExcluded: boolean;
  source: string;
  notes: string | null;
  category: Category | null;
  account: { id: string; name: string; type: string; isJoint?: boolean };
  transferPairId: string | null;
  transferPair: { account: { id: string; name: string } } | null;
  splits: Array<{ id: string; amount: number; note: string | null; categoryId: string | null; category: Category | null }>;
  reimbursementsReceived?: ReimbursementLink[];
  reimbursementsApplied?: ReimbursementLink[];
  payerUserId?: string | null;
  recurringType?: string | null;
  tags?: Array<{ tag: Tag }>;
}

interface HouseholdMember {
  id: string;
  name: string;
}

// Module-level cache so we don't refetch household on every drawer open.
let cachedMembers: HouseholdMember[] | null = null;

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
    notes: "",
    categoryId: "",
    payerUserId: "",
  });
  const [learn, setLearn] = useState(true);
  const [saving, setSaving] = useState(false);
  const [members, setMembers] = useState<HouseholdMember[]>(cachedMembers ?? []);
  const [isExcluded, setIsExcluded] = useState(false);
  const [recurringType, setRecurringType] = useState<string | null>(null);

  useEffect(() => {
    if (cachedMembers) return;
    fetch("/api/household")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        const list: HouseholdMember[] = d?.household?.members ?? [];
        cachedMembers = list;
        setMembers(list);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!tx) return;
    setForm({
      merchant: tx.merchant ?? tx.description,
      notes: tx.notes ?? "",
      categoryId: tx.category?.id ?? "none",
      payerUserId: tx.payerUserId ?? "",
    });
    setLearn(true);
    setIsExcluded(tx.isExcluded ?? false);
    setRecurringType(tx.recurringType ?? null);
  }, [tx?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  async function toggleExclude() {
    if (!tx) return;
    const next = !isExcluded;
    setIsExcluded(next);
    try {
      await fetchJson(`/api/transactions/${tx.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isExcluded: next }),
      });
      onChanged();
    } catch {
      setIsExcluded(!next);
      toast.error("Failed to update");
    }
  }

  async function setRecurringTypeRemote(next: string | null) {
    if (!tx) return;
    const prev = recurringType;
    setRecurringType(next);
    try {
      await fetchJson(`/api/transactions/${tx.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ recurringType: next }),
      });
      onChanged();
    } catch {
      setRecurringType(prev);
      toast.error("Failed to update");
    }
  }

  if (!tx) return null;

  const isOpen = !!tx;
  const hasSplits = tx.splits.length >= 2;

  // If this tx's category isn't in the user's list (e.g. partner's category),
  // inject it so the dropdown shows the correct value and lets the user change it.
  const effectiveCategories =
    tx.category && !categories.find((c) => c.id === tx.category!.id)
      ? [tx.category, ...categories]
      : categories;

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
          notes: form.notes || null,
          categoryId: form.categoryId === "none" ? null : form.categoryId,
          payerUserId: form.payerUserId || null,
          learn,
        }),
      });
      toast.success("Saved");
      onChanged();
      onClose();
    } catch (e) {
      const msg = e instanceof FetchError ? e.message : (e instanceof Error ? e.message : "Failed to save");
      toast.error(msg);
      console.error("handleSave failed", e);
    } finally {
      setSaving(false);
    }
  }

  // Gifts / Other / Transfers are auto-skipped by the server — show a hint
  // so the user knows the "Remember" checkbox is irrelevant for those.
  const chosenCategoryName =
    form.categoryId === "none"
      ? null
      : effectiveCategories.find((c) => c.id === form.categoryId)?.name ?? null;
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
          {/* Amount — shows net after reimbursements when applicable */}
          {(() => {
            const received = tx.reimbursementsReceived ?? [];
            const applied = tx.reimbursementsApplied ?? [];
            const offsetSum = tx.isCredit
              ? applied.reduce((s, r) => s + r.amount, 0)
              : received.reduce((s, r) => s + r.amount, 0);
            const hasOffset = offsetSum > 0.005;
            const netAmount = Math.max(tx.amount - offsetSum, 0);
            return (
              <div className="flex items-baseline justify-between pb-3 border-b border-gray-100 dark:border-gray-800">
                <span className="text-sm text-gray-500 dark:text-gray-400">
                  {hasOffset ? "Net" : "Amount"}
                </span>
                <div className="text-right">
                  <span className={`text-2xl font-bold ${tx.isCredit ? "text-emerald-600" : "text-gray-900 dark:text-gray-100"}`}>
                    {tx.isCredit ? "+" : "−"}{formatCurrency(netAmount)}
                  </span>
                  {hasOffset && (
                    <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5 tabular-nums">
                      {formatCurrency(tx.amount)} gross − {formatCurrency(offsetSum)} {tx.isCredit ? "applied" : "reimbursed"}
                    </p>
                  )}
                </div>
              </div>
            );
          })()}

          {/* Status badges + exclude toggle */}
          <div className="flex flex-wrap gap-1.5 items-center">
            {tx.isPending && !tx.isReconciled && (
              <Badge className="bg-amber-100 text-amber-700 border-amber-200">Pending</Badge>
            )}
            {tx.isReconciled && (
              <Badge className="bg-green-100 text-green-700 border-green-200">Reconciled</Badge>
            )}
            {tx.source && (
              <Badge variant="outline" className="capitalize">{tx.source}</Badge>
            )}
            <button
              type="button"
              onClick={toggleExclude}
              title="Excluded transactions are hidden from budgets and spending totals"
              className={`px-2.5 py-0.5 text-[11px] font-medium rounded-full border transition-colors ${
                isExcluded
                  ? "bg-gray-800 text-white border-gray-700"
                  : "bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400 border-gray-200 dark:border-gray-700 hover:bg-gray-200"
              }`}
            >
              {isExcluded ? "Excluded from totals" : "Exclude from totals"}
            </button>
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

            <div className="space-y-1.5">
              <Label className="text-xs">Category</Label>
              <select
                value={form.categoryId}
                onChange={(e) => setForm((f) => ({ ...f, categoryId: e.target.value }))}
                className="w-full h-9 text-sm rounded-md border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 px-2"
              >
                <option value="none">— Uncategorized</option>
                {effectiveCategories.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>

              {/* Remember toggle — always visible when a category is picked so the
                  user sees explicitly whether save will create a rule. */}
              {form.categoryId !== "none" && form.categoryId && (
                <div
                  className={`flex items-start gap-2 mt-2 p-2 rounded-lg border text-xs ${
                    autoSkipped
                      ? "bg-gray-50 dark:bg-gray-800/60 border-gray-200 dark:border-gray-700"
                      : learn
                      ? "bg-emerald-50 dark:bg-emerald-900/20 border-emerald-200 dark:border-emerald-800/60"
                      : "bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-800/60"
                  }`}
                >
                  <input
                    type="checkbox"
                    id={`remember-${tx.id}`}
                    className="mt-0.5 h-3.5 w-3.5 rounded border-gray-300 dark:border-gray-700 accent-indigo-600 shrink-0"
                    checked={learn && !autoSkipped}
                    disabled={autoSkipped}
                    onChange={(e) => setLearn(e.target.checked)}
                  />
                  <label htmlFor={`remember-${tx.id}`} className="text-gray-700 dark:text-gray-200 cursor-pointer flex-1">
                    {autoSkipped ? (
                      <>
                        <strong>One-off only</strong> — {chosenCategoryName} is always a one-off, no rule will be created.
                      </>
                    ) : learn ? (
                      <>
                        Will remember <strong>{form.merchant || tx.description}</strong> → <strong>{chosenCategoryName}</strong> for future uploads. <span className="text-gray-500 dark:text-gray-400">Uncheck for a one-off.</span>
                      </>
                    ) : (
                      <>
                        <strong>One-off only</strong> — no rule will be created for this merchant.
                      </>
                    )}
                  </label>
                </div>
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

            {/* Recurring tag — only for debits */}
            {!tx.isCredit && (
              <div className="space-y-1.5">
                <Label className="text-xs flex items-center gap-1.5">
                  <Repeat className="w-3 h-3" /> Recurring type
                </Label>
                <div className="flex gap-1.5 flex-wrap">
                  {([
                    { value: null, label: "Auto-detect" },
                    { value: "subscription", label: "Subscription" },
                    { value: "bill", label: "Recurring Bill" },
                    { value: "none", label: "Not recurring" },
                  ] as const).map(({ value, label }) => (
                    <button
                      key={String(value)}
                      type="button"
                      onClick={() => setRecurringTypeRemote(value)}
                      className={`px-2.5 py-1 text-[11px] font-medium rounded-full border transition-colors ${
                        recurringType === value
                          ? value === "subscription"
                            ? "bg-indigo-600 text-white border-indigo-600"
                            : value === "bill"
                            ? "bg-amber-500 text-white border-amber-500"
                            : value === "none"
                            ? "bg-gray-700 text-white border-gray-700"
                            : "bg-gray-900 text-white border-gray-900 dark:bg-gray-100 dark:text-gray-900"
                          : "bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400 border-gray-200 dark:border-gray-700 hover:bg-gray-200 dark:hover:bg-gray-700"
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
                <p className="text-[10px] text-gray-400 dark:text-gray-500">
                  Overrides automatic detection on the Insights page.
                </p>
              </div>
            )}

            {/* Payer — only relevant on joint accounts with at least two
                household members, and not on transfers (which are internal
                money moves, not expenses to attribute). */}
            {tx.account.isJoint && members.length >= 2 && !tx.transferPairId && (
              <div className="space-y-1.5">
                <Label className="text-xs">Whose expense?</Label>
                <select
                  value={form.payerUserId}
                  onChange={(e) => setForm((f) => ({ ...f, payerUserId: e.target.value }))}
                  className="w-full h-9 text-sm rounded-md border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 px-2"
                >
                  <option value="">Shared (default)</option>
                  {members.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.name}
                    </option>
                  ))}
                </select>
              </div>
            )}
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

          {/* Reimbursements */}
          <ReimbursementSection tx={tx} onChanged={onChanged} />


          {/* Actions */}
          <div className="flex flex-wrap gap-2 pt-3 border-t border-gray-100 dark:border-gray-800">
            <Button size="sm" variant="outline" onClick={() => onSplit(tx)}>
              <Scissors className="w-3.5 h-3.5 mr-1.5" /> {hasSplits ? "Edit split" : "Split category"}
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

// ─── Shared Expense UI ───────────────────────────────────────────────────────

function ReimbursementSection({ tx, onChanged }: { tx: Transaction; onChanged: () => void }) {
  const [adding, setAdding] = useState(false);
  const [amount, setAmount] = useState("");
  const [personName, setPersonName] = useState("");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [settling, setSettling] = useState<string | null>(null);

  // Only relevant on debits (expenses you paid)
  if (tx.isCredit) return null;

  const existing = tx.reimbursementsReceived ?? [];
  const totalOwed = existing.reduce((s, r) => s + r.amount, 0);
  const net = Math.max(tx.amount - totalOwed, 0);
  const fullyOffset = tx.amount - totalOwed <= 0.01;

  async function handleAdd() {
    const amt = parseFloat(amount);
    if (!isFinite(amt) || amt <= 0) { toast.error("Enter a positive amount"); return; }
    setSaving(true);
    try {
      await fetchJson("/api/reimbursements", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ originalTxId: tx.id, amount: amt, personName: personName || undefined, note: note || undefined }),
      });
      toast.success("Saved");
      setAdding(false);
      setAmount("");
      setPersonName("");
      setNote("");
      onChanged();
    } catch (e) {
      toast.error(e instanceof FetchError ? e.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  }

  async function handleSettle(id: string, settled: boolean) {
    setSettling(id);
    try {
      await fetchJson(`/api/reimbursements/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ settled }),
      });
      onChanged();
    } catch {
      toast.error("Failed to update");
    } finally {
      setSettling(null);
    }
  }

  async function handleDelete(id: string) {
    try {
      await fetchJson(`/api/reimbursements/${id}`, { method: "DELETE" });
      toast.success("Removed");
      onChanged();
    } catch {
      toast.error("Failed to remove");
    }
  }

  return (
    <div className="pt-3 border-t border-gray-100 dark:border-gray-800 space-y-2">
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold text-gray-700 dark:text-gray-200 flex items-center gap-1.5">
          <HandCoins className="w-3.5 h-3.5" /> Owed to me
        </p>
        {!fullyOffset && !adding && (
          <Button size="sm" variant="outline" className="h-7 text-xs"
            onClick={() => { setAdding(true); setAmount(""); setPersonName(""); setNote(""); }}>
            <Plus className="w-3 h-3 mr-1" /> Add
          </Button>
        )}
      </div>

      {existing.length === 0 && !adding && (
        <p className="text-xs text-gray-400 dark:text-gray-500">
          Paid for others? Add how much they owe you — counts against your net cost.
        </p>
      )}

      {existing.map((r) => (
        <div key={r.id} className={`flex items-center gap-2 text-xs px-2 py-1.5 rounded-md border ${
          r.settled
            ? "bg-emerald-50 dark:bg-emerald-900/20 border-emerald-200 dark:border-emerald-800/60"
            : "bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-800/60"
        }`}>
          <div className="flex-1 min-w-0">
            <p className="font-semibold tabular-nums text-gray-900 dark:text-gray-100">
              {formatCurrency(r.amount)}
              <span className={`ml-1.5 text-[10px] font-semibold uppercase tracking-wide px-1 py-0.5 rounded ${
                r.settled
                  ? "bg-emerald-100 dark:bg-emerald-900 text-emerald-700 dark:text-emerald-300"
                  : "bg-amber-100 dark:bg-amber-900 text-amber-700 dark:text-amber-300"
              }`}>
                {r.settled ? "Settled" : "Outstanding"}
              </span>
            </p>
            {(r.personName || r.note) && (
              <p className="text-gray-500 dark:text-gray-400 truncate">
                {r.personName}{r.personName && r.note ? " · " : ""}{r.note}
              </p>
            )}
          </div>
          <button
            onClick={() => handleSettle(r.id, !r.settled)}
            disabled={settling === r.id}
            className="text-xs text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100 shrink-0 underline underline-offset-2"
          >
            {r.settled ? "Unsettle" : "Mark settled"}
          </button>
          <button onClick={() => handleDelete(r.id)} className="text-gray-400 hover:text-red-500 shrink-0" aria-label="Remove">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      ))}

      {totalOwed > 0 && (
        <p className="text-xs text-gray-500 dark:text-gray-400 tabular-nums">
          Your share: <strong className="text-gray-900 dark:text-gray-100">{formatCurrency(net)}</strong>
          {" "}· {formatCurrency(totalOwed)} owed back
          {fullyOffset && <span className="ml-1 text-emerald-600 dark:text-emerald-400">(fully covered)</span>}
        </p>
      )}


      {adding && (
        <div className="space-y-2 bg-gray-50 dark:bg-gray-800/60 p-2 rounded-md">
          <div className="flex gap-2">
            <Input
              type="number" step="0.01" min="0"
              value={amount} onChange={(e) => setAmount(e.target.value)}
              placeholder="Amount owed"
              className="h-8 flex-1"
              autoFocus
            />
            <Input
              value={personName} onChange={(e) => setPersonName(e.target.value)}
              placeholder="Who? e.g. Josh"
              className="h-8 flex-1"
            />
          </div>
          <Input
            value={note} onChange={(e) => setNote(e.target.value)}
            placeholder="Note (optional, e.g. dinner)"
            className="h-8"
          />
          <div className="flex gap-2">
            <Button size="sm" onClick={handleAdd} disabled={saving}>
              {saving ? "Saving…" : "Save"}
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setAdding(false)} disabled={saving}>
              Cancel
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
