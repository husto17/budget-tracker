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
  note: string | null;
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
    amount: "",
    date: "",
    notes: "",
    categoryId: "",
    payerUserId: "",
  });
  const [learn, setLearn] = useState(true);
  const [saving, setSaving] = useState(false);
  const [members, setMembers] = useState<HouseholdMember[]>(cachedMembers ?? []);
  const [allTags, setAllTags] = useState<Tag[]>([]);
  const [txTags, setTxTags] = useState<Tag[]>([]);
  const [tagInput, setTagInput] = useState("");
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
    fetchJson<Tag[]>("/api/tags").then(setAllTags).catch(() => {});
  }, []);

  useEffect(() => {
    if (!tx) return;
    setForm({
      merchant: tx.merchant ?? tx.description,
      amount: tx.amount.toFixed(2),
      date: format(parseISO(tx.date), "yyyy-MM-dd"),
      notes: tx.notes ?? "",
      categoryId: tx.category?.id ?? "none",
      payerUserId: tx.payerUserId ?? "",
    });
    setLearn(true);
    setIsExcluded(tx.isExcluded ?? false);
    setRecurringType(tx.recurringType ?? null);
    setTxTags((tx.tags ?? []).map((t) => t.tag));
    setTagInput("");
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

  async function addTag(name: string, color?: string) {
    if (!tx || !name.trim()) return;
    try {
      const tag = await fetchJson<Tag>(`/api/transactions/${tx.id}/tags`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim(), color }),
      });
      setTxTags((prev) => prev.find((t) => t.id === tag.id) ? prev : [...prev, tag]);
      if (!allTags.find((t) => t.id === tag.id)) setAllTags((prev) => [...prev, tag]);
      setTagInput("");
    } catch {
      toast.error("Failed to add tag");
    }
  }

  async function removeTag(tagId: string) {
    if (!tx) return;
    setTxTags((prev) => prev.filter((t) => t.id !== tagId));
    try {
      await fetchJson(`/api/transactions/${tx.id}/tags`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tagId }),
      });
    } catch {
      toast.error("Failed to remove tag");
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
          amount: parseFloat(form.amount),
          date: form.date,
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
                      effectiveCategories.find((c) => c.id === form.categoryId)?.name ?? "—"
                    )}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">— None</SelectItem>
                  {effectiveCategories.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      <div className="flex items-center gap-2">
                        <CategoryIcon icon={c.icon} color={c.color} size="sm" />
                        {c.name}
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

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

            {/* Tags */}
            <div className="space-y-1.5">
              <Label className="text-xs">Tags</Label>
              <div className="flex flex-wrap gap-1.5 mb-1.5">
                {txTags.map((tag) => (
                  <span
                    key={tag.id}
                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium text-white"
                    style={{ backgroundColor: tag.color }}
                  >
                    {tag.name}
                    <button type="button" onClick={() => removeTag(tag.id)} className="ml-0.5 opacity-70 hover:opacity-100">
                      <X className="w-3 h-3" />
                    </button>
                  </span>
                ))}
              </div>
              <div className="flex gap-1.5">
                <Input
                  value={tagInput}
                  onChange={(e) => setTagInput(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addTag(tagInput); } }}
                  placeholder="Add tag…"
                  className="h-8 text-xs flex-1"
                  list={`tag-suggestions-${tx.id}`}
                />
                <datalist id={`tag-suggestions-${tx.id}`}>
                  {allTags.filter((t) => !txTags.find((tt) => tt.id === t.id)).map((t) => (
                    <option key={t.id} value={t.name} />
                  ))}
                </datalist>
                <Button type="button" size="sm" variant="outline" className="h-8 px-2" onClick={() => addTag(tagInput)}>
                  <Plus className="w-3.5 h-3.5" />
                </Button>
              </div>
              {allTags.filter((t) => !txTags.find((tt) => tt.id === t.id)).length > 0 && (
                <div className="flex flex-wrap gap-1 mt-1">
                  {allTags.filter((t) => !txTags.find((tt) => tt.id === t.id)).map((t) => (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => addTag(t.name, t.color)}
                      className="px-2 py-0.5 rounded-full text-[11px] border border-dashed text-gray-500 dark:text-gray-400 hover:opacity-80"
                      style={{ borderColor: t.color, color: t.color }}
                    >
                      + {t.name}
                    </button>
                  ))}
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

// ─── Reimbursement UI ────────────────────────────────────────────────────────

interface CandidateTx {
  id: string;
  date: string;
  merchant: string | null;
  description: string;
  amount: number;
  isCredit: boolean;
}

function ReimbursementSection({ tx, onChanged }: { tx: Transaction; onChanged: () => void }) {
  const [adding, setAdding] = useState(false);
  const [candidates, setCandidates] = useState<CandidateTx[]>([]);
  const [loadingCands, setLoadingCands] = useState(false);
  const [amount, setAmount] = useState("");
  const [pickedId, setPickedId] = useState("");
  const [saving, setSaving] = useState(false);

  // For a debit we're looking for credit txns to link; for a credit we're
  // looking for debits to offset. Pull the last 60 days of the opposite-
  // direction transactions from the same household.
  const lookingFor: "credit" | "debit" = tx.isCredit ? "debit" : "credit";

  async function loadCandidates() {
    setLoadingCands(true);
    try {
      const params = new URLSearchParams({
        limit: "30",
        from: format(new Date(Date.now() - 60 * 24 * 60 * 60 * 1000), "yyyy-MM-dd"),
      });
      const data = await fetchJson<{ transactions: CandidateTx[] }>(
        `/api/transactions?${params}`,
      );
      const filtered = data.transactions.filter(
        (t) => t.id !== tx.id && (lookingFor === "credit" ? t.isCredit : !t.isCredit),
      );
      setCandidates(filtered);
    } catch {
      toast.error("Couldn't load candidate transactions");
    } finally {
      setLoadingCands(false);
    }
  }

  function openPicker() {
    setAdding(true);
    setAmount("");
    setPickedId("");
    if (candidates.length === 0) loadCandidates();
  }

  async function handleSaveLink() {
    if (!pickedId) return;
    const amt = parseFloat(amount);
    if (!isFinite(amt) || amt <= 0) {
      toast.error("Enter a positive amount");
      return;
    }
    setSaving(true);
    try {
      const body = tx.isCredit
        ? { originalTxId: pickedId, reimbursementTxId: tx.id, amount: amt }
        : { originalTxId: tx.id, reimbursementTxId: pickedId, amount: amt };
      await fetchJson("/api/reimbursements", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      toast.success("Linked");
      setAdding(false);
      onChanged();
    } catch (e) {
      toast.error(e instanceof FetchError ? e.message : "Failed to link");
    } finally {
      setSaving(false);
    }
  }

  async function handleUnlink(linkId: string) {
    try {
      await fetchJson(`/api/reimbursements/${linkId}`, { method: "DELETE" });
      toast.success("Unlinked");
      onChanged();
    } catch {
      toast.error("Failed to unlink");
    }
  }

  const existing = tx.isCredit ? tx.reimbursementsApplied ?? [] : tx.reimbursementsReceived ?? [];
  const totalLinked = existing.reduce((s, r) => s + r.amount, 0);
  const net = Math.max(tx.amount - totalLinked, 0);
  const fullyOffset = tx.amount - totalLinked <= 0.01;

  const pickedTx = candidates.find((c) => c.id === pickedId);

  return (
    <div className="pt-3 border-t border-gray-100 dark:border-gray-800 space-y-2">
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold text-gray-700 dark:text-gray-200 flex items-center gap-1.5">
          <HandCoins className="w-3.5 h-3.5" />
          {tx.isCredit ? "Applied as reimbursement for" : "Reimbursed by others"}
        </p>
        {!fullyOffset && (
          <Button size="sm" variant="outline" className="h-7 text-xs" onClick={openPicker}>
            <Plus className="w-3 h-3 mr-1" /> Link
          </Button>
        )}
      </div>

      {existing.length === 0 && !adding && (
        <p className="text-xs text-gray-400 dark:text-gray-500">
          {tx.isCredit
            ? "Not linked to any spending. Use this to mark a friend's Venmo/Zelle as offsetting something you paid."
            : "Was this partly for others? Link the Venmo/Zelle credits they sent you to show your true cost."}
        </p>
      )}

      {existing.map((r) => {
        const other = tx.isCredit ? r.originalTx : r.reimbursementTx;
        if (!other) return null;
        return (
          <div
            key={r.id}
            className="flex items-center justify-between text-xs bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800/60 px-2 py-1.5 rounded-md"
          >
            <div className="min-w-0 flex-1">
              <p className="font-medium text-gray-900 dark:text-gray-100 truncate">
                {other.merchant ?? other.description}
              </p>
              <p className="text-gray-500 dark:text-gray-400 text-[11px]">
                {format(new Date(other.date), "d MMM")} · {formatCurrency(other.amount)}
              </p>
            </div>
            <span className="font-semibold text-emerald-700 dark:text-emerald-300 tabular-nums mx-2">
              {formatCurrency(r.amount)}
            </span>
            <button
              onClick={() => handleUnlink(r.id)}
              className="text-gray-400 hover:text-red-500 shrink-0"
              title="Unlink"
              aria-label="Unlink reimbursement"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        );
      })}

      {existing.length > 0 && (
        <p className="text-xs text-gray-500 dark:text-gray-400 tabular-nums">
          Linked total: <strong>{formatCurrency(totalLinked)}</strong>
          {!tx.isCredit && (
            <>
              {" "}· Your net cost: <strong className="text-gray-900 dark:text-gray-100">{formatCurrency(net)}</strong>
            </>
          )}
        </p>
      )}

      {adding && (
        <div className="space-y-2 bg-gray-50 dark:bg-gray-800/60 p-2 rounded-md">
          <Label className="text-xs">{tx.isCredit ? "Which spending does this offset?" : "Which credit reimburses this?"}</Label>
          {loadingCands ? (
            <p className="text-xs text-gray-400 py-2 text-center">Loading…</p>
          ) : candidates.length === 0 ? (
            <p className="text-xs text-gray-400 py-2 text-center">No matching {lookingFor}s in the last 60 days.</p>
          ) : (
            <Select value={pickedId} onValueChange={(v) => {
              setPickedId(v ?? "");
              const match = candidates.find((c) => c.id === v);
              if (match && !amount) setAmount(Math.min(match.amount, tx.amount).toFixed(2));
            }}>
              <SelectTrigger>
                <SelectValue>
                  {pickedTx ? `${pickedTx.merchant ?? pickedTx.description} · ${formatCurrency(pickedTx.amount)}` : "Pick a transaction…"}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                {candidates.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    <div className="flex items-center justify-between gap-3 w-full">
                      <span className="truncate">{c.merchant ?? c.description}</span>
                      <span className="text-xs text-gray-500 tabular-nums">{formatCurrency(c.amount)}</span>
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          <div className="flex gap-2">
            <Input
              type="number"
              step="0.01"
              min="0"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="Amount"
              className="h-8"
            />
            <Button size="sm" onClick={handleSaveLink} disabled={saving || !pickedId}>
              {saving ? "Linking…" : "Link"}
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
