"use client";

import { useState, useEffect, useCallback, useRef, useMemo, Fragment, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { toast } from "sonner";
import {
  Search,
  Filter,
  ArrowUpDown,
  Tag,
  Trash2,
  ArrowRightLeft,
  Plus,
  Link2,
  Unlink,
  Scissors,
  Pencil,
  ChevronDown,
  ChevronRight,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { format, addDays, subDays } from "date-fns";
import { CategoryIcon } from "@/components/ui/category-icon";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { fetchJson, FetchError, formatCurrency } from "@/lib/fetcher";

interface Category {
  id: string;
  name: string;
  color: string;
  icon?: string | null;
}

interface Account {
  id: string;
  name: string;
  type: string;
}

interface TransactionSplit {
  id: string;
  amount: number;
  note: string | null;
  categoryId: string | null;
  category: Category | null;
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
  category: Category | null;
  account: Account;
  notes: string | null;
  transferPairId: string | null;
  transferPair: { account: { id: string; name: string } } | null;
  splits: TransactionSplit[];
}

function TransactionsContent() {
  const searchParams = useSearchParams();
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [categories, setCategories] = useState<Category[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);

  // Search with debounce
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [filterAccount, setFilterAccount] = useState("all");
  const [filterCategory, setFilterCategory] = useState("all");
  const [filterUncategorized, setFilterUncategorized] = useState(false);
  const initialStatus = searchParams.get("status");
  const [statusFilter, setStatusFilter] = useState<"all" | "pending" | "posted">(
    initialStatus === "pending" ? "pending" : initialStatus === "posted" ? "posted" : "all"
  );
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  // Bulk selection
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkCatId, setBulkCatId] = useState("");
  const [applyingBulk, setApplyingBulk] = useState(false);

  // Add transaction
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [addForm, setAddForm] = useState({
    accountId: "",
    date: format(new Date(), "yyyy-MM-dd"),
    description: "",
    amount: "",
    isCredit: false,
    categoryId: "",
    notes: "",
  });

  // Transfer linking
  const [linkTransferTx, setLinkTransferTx] = useState<Transaction | null>(null);
  const [transferSearch, setTransferSearch] = useState("");
  const [transferCandidates, setTransferCandidates] = useState<Transaction[]>([]);
  const [loadingCandidates, setLoadingCandidates] = useState(false);
  const [selectedPair, setSelectedPair] = useState<string>("");
  const [linkingTransfer, setLinkingTransfer] = useState(false);

  // Transfer pair collapse state
  const [expandedPairs, setExpandedPairs] = useState<Set<string>>(new Set());
  const [linkingBulk, setLinkingBulk] = useState(false);

  // Inline edit
  const [editTx, setEditTx] = useState<Transaction | null>(null);
  const [editForm, setEditForm] = useState({ description: "", amount: "", date: "", notes: "" });
  const [savingEdit, setSavingEdit] = useState(false);

  // Split transaction
  const [splitTx, setSplitTx] = useState<Transaction | null>(null);
  const [splitRows, setSplitRows] = useState<
    Array<{ categoryId: string; amount: string; note: string }>
  >([]);
  const [savingSplit, setSavingSplit] = useState(false);

  // Delete confirm
  const [deleteTargetId, setDeleteTargetId] = useState<string | null>(null);

  // Reprocess merchant names
  const [reprocessing, setReprocessing] = useState(false);

  const LIMIT = 50;

  const fetchTransactions = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams({
      page: String(page),
      limit: String(LIMIT),
      ...(filterAccount !== "all" ? { accountId: filterAccount } : {}),
      ...(filterCategory !== "all" ? { categoryId: filterCategory } : {}),
      ...(filterUncategorized ? { uncategorized: "true" } : {}),
      ...(search ? { search } : {}),
      ...(from ? { from } : {}),
      ...(to ? { to } : {}),
      ...(statusFilter !== "all" ? { status: statusFilter } : {}),
    });
    try {
      const data = await fetchJson<{ transactions: Transaction[]; total: number }>(
        `/api/transactions?${params}`,
      );
      setTransactions(data.transactions);
      setTotal(data.total);
      setLoadError(null);
    } catch (e) {
      setLoadError(e instanceof FetchError ? e.message : "Couldn't load transactions");
    } finally {
      setLoading(false);
    }
  }, [page, filterAccount, filterCategory, filterUncategorized, search, from, to, statusFilter]);

  useEffect(() => {
    fetchTransactions();
  }, [fetchTransactions]);

  useEffect(() => {
    const catName = searchParams.get("categoryName");
    const catId = searchParams.get("categoryId");
    const accId = searchParams.get("accountId");
    fetchJson<Category[]>("/api/categories")
      .then((data) => {
        setCategories(data);
        // Pre-filter when navigated from dashboard/accounts/categories pages
        if (catId) {
          setFilterCategory(catId);
        } else if (catName) {
          const match = data.find((c) => c.name.toLowerCase() === catName.toLowerCase());
          if (match) setFilterCategory(match.id);
        }
      })
      .catch(() => toast.error("Couldn't load categories"));
    fetchJson<Account[]>("/api/accounts")
      .then((data) => {
        setAccounts(data);
        if (data.length > 0) setAddForm((f) => ({ ...f, accountId: data[0].id }));
        if (accId) setFilterAccount(accId);
      })
      .catch(() => toast.error("Couldn't load accounts"));
  }, [searchParams]);

  // Debounce search input
  function handleSearchChange(value: string) {
    setSearchInput(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setSearch(value);
      setPage(1);
    }, 250);
  }

  async function updateCategory(txId: string, categoryId: string | null) {
    try {
      await fetchJson(`/api/transactions/${txId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ categoryId }),
      });
      fetchTransactions();
    } catch (e) {
      toast.error(e instanceof FetchError ? e.message : "Failed to update category", {
        action: { label: "Retry", onClick: () => updateCategory(txId, categoryId) },
      });
    }
  }

  async function handleDelete() {
    if (!deleteTargetId) return;
    const res = await fetch(`/api/transactions/${deleteTargetId}`, { method: "DELETE" });
    if (res.ok) {
      toast.success("Deleted");
      fetchTransactions();
    } else {
      toast.error("Failed to delete");
      throw new Error("delete failed");
    }
  }

  async function handleBulkCategorize() {
    if (!bulkCatId || selected.size === 0) return;
    setApplyingBulk(true);
    const categoryId = bulkCatId === "__none__" ? null : bulkCatId;
    const res = await fetch("/api/transactions/bulk", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        transactionIds: Array.from(selected),
        categoryId,
      }),
    });
    if (res.ok) {
      const prevIds = Array.from(selected);
      const prevCategoryIds = prevIds.map(id => transactions.find(t => t.id === id)?.category?.id ?? null);
      setSelected(new Set());
      setBulkCatId("");
      fetchTransactions();
      toast.success(`Categorized ${prevIds.length} transactions`, {
        action: {
          label: "Undo",
          onClick: async () => {
            await Promise.all(prevIds.map((id, i) =>
              fetch(`/api/transactions/${id}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ categoryId: prevCategoryIds[i] }),
              })
            ));
            fetchTransactions();
            toast.success("Undone");
          },
        },
      });
    } else {
      toast.error("Failed to apply categories", {
        action: { label: "Retry", onClick: handleBulkCategorize },
      });
    }
    setApplyingBulk(false);
  }

  function openEditDialog(tx: Transaction) {
    setEditTx(tx);
    setEditForm({
      description: tx.merchant ?? tx.description,
      amount: tx.amount.toFixed(2),
      date: format(new Date(tx.date), "yyyy-MM-dd"),
      notes: tx.notes ?? "",
    });
  }

  async function handleSaveEdit() {
    if (!editTx) return;
    setSavingEdit(true);
    const res = await fetch(`/api/transactions/${editTx.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        description: editForm.description,
        merchant: editForm.description,
        amount: editForm.amount,
        date: editForm.date,
        notes: editForm.notes || null,
      }),
    });
    if (res.ok) {
      setEditTx(null);
      fetchTransactions();
      toast.success("Transaction updated");
    } else {
      toast.error("Failed to save");
    }
    setSavingEdit(false);
  }

  async function handleAddTransaction() {
    const res = await fetch("/api/transactions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...addForm,
        amount: parseFloat(addForm.amount),
        categoryId: addForm.categoryId || null,
      }),
    });
    if (res.ok) {
      toast.success("Transaction added");
      setShowAddDialog(false);
      fetchTransactions();
    } else {
      const d = await res.json();
      toast.error(d.error ?? "Failed to add");
    }
  }

  function toggleSelect(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  // Transfer linking helpers
  async function openLinkTransferDialog(tx: Transaction) {
    setLinkTransferTx(tx);
    setTransferSearch("");
    setSelectedPair("");
    await fetchTransferCandidates(tx, "");
  }

  async function fetchTransferCandidates(tx: Transaction, searchTerm: string) {
    setLoadingCandidates(true);
    const txDate = new Date(tx.date);
    const dateFrom = format(subDays(txDate, 7), "yyyy-MM-dd");
    const dateTo = format(addDays(txDate, 7), "yyyy-MM-dd");
    const params = new URLSearchParams({
      limit: "50",
      from: dateFrom,
      to: dateTo,
      ...(searchTerm ? { search: searchTerm } : {}),
    });
    const res = await fetch(`/api/transactions?${params}`);
    if (res.ok) {
      const data = await res.json();
      // Exclude current transaction and already-paired ones (unless it's the existing pair)
      const filtered = (data.transactions as Transaction[]).filter(
        (t) => t.id !== tx.id
      );
      setTransferCandidates(filtered);
    }
    setLoadingCandidates(false);
  }

  async function handleLinkTransfer() {
    if (!linkTransferTx || !selectedPair) return;
    setLinkingTransfer(true);
    const res = await fetch(`/api/transactions/${linkTransferTx.id}/transfer`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pairedTransactionId: selectedPair }),
    });
    if (res.ok) {
      toast.success("Transfer linked");
      setLinkTransferTx(null);
      fetchTransactions();
    } else {
      toast.error("Failed to link transfer");
    }
    setLinkingTransfer(false);
  }

  async function handleUnlinkTransfer(txId: string) {
    const res = await fetch(`/api/transactions/${txId}/transfer`, {
      method: "DELETE",
    });
    if (res.ok) {
      toast.success("Transfer unlinked");
      fetchTransactions();
    } else {
      toast.error("Failed to unlink transfer");
    }
  }

  // For each tx that's in a pair where BOTH sides are on this page,
  // record which side is "first" (keeps the collapsed row there) and
  // a stable pair key used for expand state + React keys.
  const pairInfo = useMemo(() => {
    const byId = new Map(transactions.map((t) => [t.id, t]));
    const info = new Map<string, { pairKey: string; isFirst: boolean; other: Transaction }>();
    const firstSeen = new Set<string>();
    for (const tx of transactions) {
      if (!tx.transferPairId) continue;
      const other = byId.get(tx.transferPairId);
      if (!other) continue; // pair's other side not on this page — render normally
      const pairKey = [tx.id, other.id].sort().join("_");
      const isFirst = !firstSeen.has(pairKey);
      if (isFirst) firstSeen.add(pairKey);
      info.set(tx.id, { pairKey, isFirst, other });
    }
    return info;
  }, [transactions]);

  function togglePairExpanded(pairKey: string) {
    setExpandedPairs((prev) => {
      const next = new Set(prev);
      if (next.has(pairKey)) next.delete(pairKey);
      else next.add(pairKey);
      return next;
    });
  }

  function togglePairSelect(aId: string, bId: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      const both = next.has(aId) && next.has(bId);
      if (both) { next.delete(aId); next.delete(bId); }
      else { next.add(aId); next.add(bId); }
      return next;
    });
  }

  // Bulk-link: exactly 2 selected, different accounts, opposite direction, same amount
  const bulkLinkEligible = useMemo(() => {
    if (selected.size !== 2) return false;
    const [aId, bId] = Array.from(selected);
    const a = transactions.find((t) => t.id === aId);
    const b = transactions.find((t) => t.id === bId);
    if (!a || !b) return false;
    if (a.transferPairId || b.transferPairId) return false;
    if (a.account.id === b.account.id) return false;
    if (a.isCredit === b.isCredit) return false;
    if (Math.abs(a.amount - b.amount) > 0.01) return false;
    return true;
  }, [selected, transactions]);

  async function handleBulkLink() {
    if (!bulkLinkEligible) return;
    const [aId, bId] = Array.from(selected);
    setLinkingBulk(true);
    const res = await fetch(`/api/transactions/${aId}/transfer`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pairedTransactionId: bId }),
    });
    if (res.ok) {
      toast.success("Transfer linked");
      setSelected(new Set());
      fetchTransactions();
    } else {
      const d = await res.json().catch(() => ({}));
      toast.error(d.error ?? "Failed to link transfer");
    }
    setLinkingBulk(false);
  }

  function openSplitDialog(tx: Transaction) {
    setSplitTx(tx);
    if (tx.splits && tx.splits.length >= 2) {
      setSplitRows(
        tx.splits.map((s) => ({
          categoryId: s.categoryId ?? "",
          amount: s.amount.toFixed(2),
          note: s.note ?? "",
        }))
      );
    } else {
      setSplitRows([
        { categoryId: "", amount: "", note: "" },
        { categoryId: "", amount: "", note: "" },
      ]);
    }
  }

  async function handleSaveSplit() {
    if (!splitTx) return;
    setSavingSplit(true);
    const splits = splitRows.map((r) => ({
      categoryId: r.categoryId || null,
      amount: parseFloat(r.amount) || 0,
      note: r.note || undefined,
    }));
    const res = await fetch(`/api/transactions/${splitTx.id}/splits`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ splits }),
    });
    if (res.ok) {
      toast.success("Transaction split saved");
      setSplitTx(null);
      fetchTransactions();
    } else {
      const d = await res.json();
      toast.error(d.error ?? "Failed to save split");
    }
    setSavingSplit(false);
  }

  const totalPages = Math.ceil(total / LIMIT);

  const reprocessNames = useCallback(
    async (silent = false) => {
      setReprocessing(true);
      try {
        const data = await fetchJson<{
          updated: number;
          renamed: number;
          categorized: number;
          total: number;
        }>("/api/transactions/reprocess", { method: "POST" });
        if (data.updated === 0) {
          if (!silent) toast.success("Everything already up to date");
        } else {
          const parts: string[] = [];
          if (data.renamed > 0) parts.push(`renamed ${data.renamed}`);
          if (data.categorized > 0) parts.push(`categorized ${data.categorized}`);
          toast.success(
            `Cleaned up ${data.updated} transaction${data.updated !== 1 ? "s" : ""} (${parts.join(", ")})`,
          );
          fetchTransactions();
        }
      } catch (e) {
        if (!silent) toast.error(e instanceof FetchError ? e.message : "Failed to refresh");
      } finally {
        setReprocessing(false);
      }
    },
    [fetchTransactions],
  );

  // Auto-run reprocess once per session so newly-shipped rules / normalizer
  // changes reach existing data without the user having to click. The version
  // bumps whenever the normalizer/rules ship meaningful changes — old sessions
  // then re-fire on next visit.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const REPROCESS_VERSION = "2026-04-18-v3";
    if (sessionStorage.getItem("transactionsReprocessedVersion") === REPROCESS_VERSION) return;
    sessionStorage.setItem("transactionsReprocessedVersion", REPROCESS_VERSION);
    reprocessNames(true);
  }, [reprocessNames]);

  return (
    <div className="space-y-6 pb-24">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Transactions</h1>
          <p className="text-sm text-gray-500 mt-1">{total.toLocaleString()} total</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => reprocessNames(false)} disabled={reprocessing}>
            {reprocessing ? "Cleaning..." : "Clean up + categorize"}
          </Button>
          <Button onClick={() => setShowAddDialog(true)} size="sm">
            <Plus className="w-4 h-4 mr-2" /> Add Manual
          </Button>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white border border-gray-200 rounded-xl p-4 space-y-3">
        <div className="flex items-center gap-2 text-sm font-medium text-gray-700">
          <Filter className="w-4 h-4" /> Filters
        </div>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
          {/* Search — full-width on mobile */}
          <div className="relative col-span-1 md:col-span-1 w-full">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <Input
              value={searchInput}
              onChange={(e) => handleSearchChange(e.target.value)}
              placeholder="Search transactions..."
              className="pl-9 w-full"
            />
          </div>
          <Select
            value={filterAccount}
            onValueChange={(v) => {
              setFilterAccount(v ?? "all");
              setPage(1);
            }}
          >
            <SelectTrigger>
              <SelectValue>
                {filterAccount === "all" ? "All accounts" : accounts.find(a => a.id === filterAccount)?.name ?? "All accounts"}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All accounts</SelectItem>
              {accounts.map((a) => (
                <SelectItem key={a.id} value={a.id}>
                  {a.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select
            value={filterCategory}
            onValueChange={(v) => {
              setFilterCategory(v ?? "all");
              setPage(1);
            }}
          >
            <SelectTrigger>
              <SelectValue>
                {filterCategory === "all" ? "All categories" : categories.find(c => c.id === filterCategory)?.name ?? "All categories"}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All categories</SelectItem>
              {categories.map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {c.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            variant={filterUncategorized ? "default" : "outline"}
            size="sm"
            onClick={() => {
              setFilterUncategorized(!filterUncategorized);
              setPage(1);
            }}
            className="h-10"
          >
            Uncategorized only
          </Button>
        </div>
        {/* Status filter */}
        <div className="flex items-center gap-1.5">
          <span className="text-xs text-gray-500 font-medium mr-1">Show:</span>
          {(["all", "posted", "pending"] as const).map((s) => (
            <button
              key={s}
              onClick={() => {
                setStatusFilter(s);
                setPage(1);
              }}
              className={`px-3 py-1 text-xs rounded-full font-medium transition-colors ${
                statusFilter === s
                  ? s === "pending"
                    ? "bg-amber-100 text-amber-700"
                    : "bg-gray-900 text-white"
                  : "bg-gray-100 text-gray-500 hover:bg-gray-200"
              }`}
            >
              {s.charAt(0).toUpperCase() + s.slice(1)}
            </button>
          ))}
        </div>
        <div className="flex gap-3 items-end">
          <div className="space-y-1">
            <Label className="text-xs">From</Label>
            <Input
              type="date"
              value={from}
              onChange={(e) => {
                setFrom(e.target.value);
                setPage(1);
              }}
              className="h-8 text-sm"
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">To</Label>
            <Input
              type="date"
              value={to}
              onChange={(e) => {
                setTo(e.target.value);
                setPage(1);
              }}
              className="h-8 text-sm"
            />
          </div>
          {(searchInput ||
            filterAccount !== "all" ||
            filterCategory !== "all" ||
            filterUncategorized ||
            from ||
            to) && (
            <Button
              variant="ghost"
              size="sm"
              className="h-8 text-gray-400"
              onClick={() => {
                setSearchInput("");
                setSearch("");
                setFilterAccount("all");
                setFilterCategory("all");
                setFilterUncategorized(false);
                setFrom("");
                setTo("");
                setPage(1);
              }}
            >
              Clear filters
            </Button>
          )}
        </div>
      </div>

      {/* Table */}
      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        {loading ? (
          <div className="divide-y divide-gray-50">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="px-4 py-4 flex items-center gap-3">
                <Skeleton className="w-8 h-8 rounded-full" />
                <div className="flex-1 space-y-2">
                  <Skeleton className="h-4 w-48" />
                  <Skeleton className="h-3 w-32" />
                </div>
                <Skeleton className="h-5 w-20" />
              </div>
            ))}
          </div>
        ) : loadError ? (
          <div className="text-center py-12">
            <p className="text-sm text-red-600 font-medium">{loadError}</p>
            <Button variant="outline" size="sm" className="mt-3" onClick={fetchTransactions}>
              Try again
            </Button>
          </div>
        ) : transactions.length === 0 ? (
          <div className="text-center py-12 text-gray-400">
            <ArrowUpDown className="w-10 h-10 mx-auto mb-3 opacity-30" />
            <p>No transactions found</p>
          </div>
        ) : (
          <>
            {/* Mobile card list */}
            <div className="md:hidden divide-y divide-gray-50">
              {transactions.map((tx) => {
                const info = pairInfo.get(tx.id);
                if (info && !info.isFirst && !expandedPairs.has(info.pairKey)) return null;
                const isFirstOfPair = !!info?.isFirst;
                const isExpanded = info ? expandedPairs.has(info.pairKey) : false;
                const showNormalRow = !info || isExpanded;

                let pairCard = null;
                if (isFirstOfPair && info) {
                  const other = info.other;
                  const outgoing = tx.isCredit ? other : tx;
                  const incoming = tx.isCredit ? tx : other;
                  const bothSelected = selected.has(tx.id) && selected.has(other.id);
                  const isCreditCardPayment =
                    outgoing.account.type === "CREDIT_CARD" || incoming.account.type === "CREDIT_CARD";
                  const pairLabel = isCreditCardPayment ? "Credit card payment" : "Transfer";
                  pairCard = (
                    <div key={`pair-${info.pairKey}`} className="px-4 py-3 flex items-center gap-3 bg-blue-50/40">
                      <input
                        type="checkbox"
                        checked={bothSelected}
                        onChange={() => togglePairSelect(tx.id, other.id)}
                        className="shrink-0"
                      />
                      <button
                        onClick={() => togglePairExpanded(info.pairKey)}
                        className="shrink-0 text-gray-400"
                      >
                        {isExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                      </button>
                      <ArrowRightLeft className="w-4 h-4 text-blue-500 shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-gray-900">{pairLabel}</p>
                        <p className="text-xs text-gray-500 truncate">
                          {outgoing.account.name} → {incoming.account.name}
                        </p>
                        <p className="text-xs text-gray-400 mt-0.5">
                          {format(new Date(outgoing.date), "dd MMM yyyy")}
                        </p>
                      </div>
                      <span className="text-sm font-medium text-gray-700 shrink-0">
                        {formatCurrency(outgoing.amount)}
                      </span>
                    </div>
                  );
                }

                if (!showNormalRow) {
                  return <Fragment key={tx.id}>{pairCard}</Fragment>;
                }

                return (
                <Fragment key={tx.id}>
                {pairCard}
                <div
                  className={`px-4 py-3 flex items-center gap-3 ${
                    selected.has(tx.id) ? "bg-blue-50" : ""
                  } ${info ? "bg-blue-50/10 pl-8" : ""}`}
                >
                  <input
                    type="checkbox"
                    checked={selected.has(tx.id)}
                    onChange={() => toggleSelect(tx.id)}
                    className="shrink-0"
                  />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-sm font-medium text-gray-900 truncate">
                        {tx.merchant ?? tx.description}
                      </p>
                      <span
                        className={`text-sm font-medium shrink-0 ${
                          tx.isCredit ? "text-green-600" : "text-gray-900"
                        }`}
                      >
                        {tx.isCredit ? "+" : "−"}
                        {formatCurrency(tx.amount)}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                      <span className="text-xs text-gray-400">
                        {format(new Date(tx.date), "dd MMM yyyy")}
                      </span>
                      {tx.isPending && !tx.isReconciled && (
                        <span className="text-xs px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700 border border-amber-200">
                          Pending
                        </span>
                      )}
                      {tx.isReconciled && (
                        <span className="text-xs px-1.5 py-0.5 rounded-full bg-green-100 text-green-700 border border-green-200">
                          Reconciled
                        </span>
                      )}
                      {tx.splits && tx.splits.length > 0 ? (
                        <span className="inline-flex items-center gap-1 text-xs px-1.5 py-0.5 rounded-full bg-purple-50 text-purple-700 border border-purple-200">
                          <Scissors className="w-2.5 h-2.5" />
                          Split
                        </span>
                      ) : tx.category ? (
                        <span
                          className="inline-flex items-center gap-1 text-xs px-1.5 py-0.5 rounded-full"
                          style={{
                            backgroundColor: tx.category.color + "20",
                            color: tx.category.color,
                          }}
                        >
                          <CategoryIcon icon={tx.category.icon} color={tx.category.color} size="sm" />
                          {tx.category.name}
                        </span>
                      ) : null}
                      {tx.transferPairId ? (
                        <Badge
                          variant="outline"
                          className="text-xs text-blue-500 gap-1 shrink-0 py-0 cursor-pointer"
                          onClick={() => handleUnlinkTransfer(tx.id)}
                        >
                          <ArrowRightLeft className="w-3 h-3" />
                          Transfer
                        </Badge>
                      ) : (
                        <button
                          className="text-xs text-gray-400 hover:text-blue-600 flex items-center gap-1"
                          onClick={() => openLinkTransferDialog(tx)}
                        >
                          <Link2 className="w-3 h-3" />
                          Link
                        </button>
                      )}
                    </div>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 text-gray-300 hover:text-red-500 shrink-0"
                    onClick={() => setDeleteTargetId(tx.id)}
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </Button>
                </div>
                </Fragment>
                );
              })}
            </div>

            {/* Desktop table */}
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-gray-100 text-xs text-gray-400 uppercase tracking-wide">
                    <th className="px-4 py-3 text-left w-8">
                      <input
                        type="checkbox"
                        checked={
                          selected.size === transactions.length &&
                          transactions.length > 0
                        }
                        onChange={(e) => {
                          if (e.target.checked)
                            setSelected(new Set(transactions.map((t) => t.id)));
                          else setSelected(new Set());
                        }}
                      />
                    </th>
                    <th className="px-4 py-3 text-left">Date</th>
                    <th className="px-4 py-3 text-left">Description</th>
                    <th className="px-4 py-3 text-left">Account</th>
                    <th className="px-4 py-3 text-left">Category</th>
                    <th className="px-4 py-3 text-right">Amount</th>
                    <th className="px-4 py-3 text-right w-24"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {transactions.map((tx) => {
                    const info = pairInfo.get(tx.id);
                    // Collapsed pair: hide the second side — the pair header represents both
                    if (info && !info.isFirst && !expandedPairs.has(info.pairKey)) return null;
                    const isFirstOfPair = !!info?.isFirst;
                    const isExpanded = info ? expandedPairs.has(info.pairKey) : false;
                    const showNormalRow = !info || isExpanded;

                    let pairHeader = null;
                    if (isFirstOfPair && info) {
                      const other = info.other;
                      const outgoing = tx.isCredit ? other : tx;
                      const incoming = tx.isCredit ? tx : other;
                      const bothSelected = selected.has(tx.id) && selected.has(other.id);
                      const isCreditCardPayment =
                        outgoing.account.type === "CREDIT_CARD" || incoming.account.type === "CREDIT_CARD";
                      const pairLabel = isCreditCardPayment ? "Credit card payment" : "Transfer";
                      pairHeader = (
                        <tr key={`pair-${info.pairKey}`} className="bg-blue-50/40 hover:bg-blue-50/60 transition-colors">
                          <td className="px-4 py-3">
                            <input
                              type="checkbox"
                              checked={bothSelected}
                              onChange={() => togglePairSelect(tx.id, other.id)}
                            />
                          </td>
                          <td className="px-4 py-3 text-sm text-gray-500 whitespace-nowrap">
                            {format(new Date(outgoing.date), "dd MMM yyyy")}
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-2">
                              <button
                                onClick={() => togglePairExpanded(info.pairKey)}
                                className="text-gray-400 hover:text-gray-700"
                                title={isExpanded ? "Collapse" : "Expand"}
                              >
                                {isExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                              </button>
                              <ArrowRightLeft className="w-4 h-4 text-blue-500 shrink-0" />
                              <div className="min-w-0">
                                <p className="text-sm font-medium text-gray-900">{pairLabel}</p>
                                <p className="text-xs text-gray-500 truncate max-w-[240px]">
                                  {outgoing.account.name} → {incoming.account.name}
                                </p>
                              </div>
                            </div>
                          </td>
                          <td className="px-4 py-3 text-sm text-gray-400">—</td>
                          <td className="px-4 py-3">
                            <Badge variant="outline" className="text-xs text-blue-600 border-blue-200 gap-1">
                              <ArrowRightLeft className="w-3 h-3" /> Transfer
                            </Badge>
                          </td>
                          <td className="px-4 py-3 text-right whitespace-nowrap">
                            <span className="text-sm font-medium text-gray-700">{formatCurrency(outgoing.amount)}</span>
                          </td>
                          <td className="px-4 py-3 text-right">
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7 text-blue-400 hover:text-red-500"
                              title="Unlink transfer"
                              onClick={() => handleUnlinkTransfer(outgoing.id)}
                            >
                              <Unlink className="w-3.5 h-3.5" />
                            </Button>
                          </td>
                        </tr>
                      );
                    }

                    if (!showNormalRow) {
                      return <Fragment key={tx.id}>{pairHeader}</Fragment>;
                    }

                    return (
                    <Fragment key={tx.id}>
                    {pairHeader}
                    <tr
                      className={`hover:bg-gray-50 transition-colors ${
                        selected.has(tx.id) ? "bg-blue-50" : ""
                      } ${tx.isPending ? "opacity-80" : ""} ${info ? "bg-blue-50/10" : ""}`}
                    >
                      <td className="px-4 py-3">
                        <input
                          type="checkbox"
                          checked={selected.has(tx.id)}
                          onChange={() => toggleSelect(tx.id)}
                        />
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-500 whitespace-nowrap">
                        {format(new Date(tx.date), "dd MMM yyyy")}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2 flex-wrap">
                          <div>
                            <p className="text-sm font-medium text-gray-900 truncate max-w-[200px]">
                              {tx.merchant ?? tx.description}
                            </p>
                            {tx.merchant && tx.merchant !== tx.description && (
                              <p className="text-xs text-gray-400 truncate max-w-[200px]">
                                {tx.description}
                              </p>
                            )}
                          </div>
                          {tx.isPending && !tx.isReconciled && (
                            <Badge className="text-xs bg-amber-100 text-amber-700 border-amber-200 hover:bg-amber-100 shrink-0">
                              Pending
                            </Badge>
                          )}
                          {tx.isReconciled && (
                            <Badge className="text-xs bg-green-100 text-green-700 border-green-200 hover:bg-green-100 shrink-0">
                              Reconciled
                            </Badge>
                          )}
                          {tx.transferPairId ? (
                            <Badge
                              variant="outline"
                              className="text-xs text-blue-500 gap-1 shrink-0 cursor-pointer hover:bg-blue-50"
                              onClick={() => handleUnlinkTransfer(tx.id)}
                              title="Click to unlink transfer"
                            >
                              <ArrowRightLeft className="w-3 h-3" />
                              Transfer
                            </Badge>
                          ) : (
                            <button
                              className="opacity-0 group-hover:opacity-100 text-xs text-gray-400 hover:text-blue-600 flex items-center gap-1 transition-opacity"
                              onClick={() => openLinkTransferDialog(tx)}
                              title="Link as transfer"
                            >
                              <Link2 className="w-3 h-3" />
                            </button>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-500 whitespace-nowrap">
                        {tx.account.name}
                      </td>
                      <td className="px-4 py-3">
                        {tx.splits && tx.splits.length > 0 ? (
                          <button
                            onClick={() => openSplitDialog(tx)}
                            className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded-full bg-purple-50 text-purple-700 border border-purple-200 hover:bg-purple-100 transition-colors"
                          >
                            <Scissors className="w-3 h-3" />
                            Split ({tx.splits.length})
                          </button>
                        ) : (
                          <Select
                            value={tx.category?.id ?? "none"}
                            onValueChange={(v) =>
                              updateCategory(tx.id, v === "none" ? null : v)
                            }
                          >
                            <SelectTrigger className="h-7 text-xs border-0 bg-transparent p-0 gap-1 w-36 hover:bg-gray-100 rounded px-2">
                              <div className="flex items-center gap-1.5 min-w-0">
                                {tx.category ? (
                                  <>
                                    <CategoryIcon
                                      icon={tx.category.icon}
                                      color={tx.category.color}
                                      size="sm"
                                    />
                                    <span className="truncate">{tx.category.name}</span>
                                  </>
                                ) : (
                                  <span className="text-gray-300">— Uncategorized</span>
                                )}
                              </div>
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
                        )}
                      </td>
                      <td className="px-4 py-3 text-right whitespace-nowrap">
                        <span
                          className={`text-sm font-medium ${
                            tx.isCredit ? "text-green-600" : "text-gray-900"
                          }`}
                        >
                          {tx.isCredit ? "+" : "−"}
                          {formatCurrency(tx.amount)}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex items-center justify-end gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 text-gray-300 hover:text-gray-700"
                            title="Edit transaction"
                            onClick={() => openEditDialog(tx)}
                          >
                            <Pencil className="w-3.5 h-3.5" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 text-gray-300 hover:text-purple-500"
                            title="Split transaction"
                            onClick={() => openSplitDialog(tx)}
                          >
                            <Scissors className="w-3.5 h-3.5" />
                          </Button>
                          {!tx.transferPairId && (
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7 text-gray-300 hover:text-blue-500"
                              title="Link as transfer"
                              onClick={() => openLinkTransferDialog(tx)}
                            >
                              <Link2 className="w-3.5 h-3.5" />
                            </Button>
                          )}
                          {tx.transferPairId && (
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7 text-blue-400 hover:text-gray-500"
                              title="Unlink transfer"
                              onClick={() => handleUnlinkTransfer(tx.id)}
                            >
                              <Unlink className="w-3.5 h-3.5" />
                            </Button>
                          )}
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 text-gray-300 hover:text-red-500"
                            onClick={() => setDeleteTargetId(tx.id)}
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                    </Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-gray-500">
            Showing {(page - 1) * LIMIT + 1}–{Math.min(page * LIMIT, total)} of{" "}
            {total}
          </p>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={page === 1}
              onClick={() => setPage(page - 1)}
            >
              Previous
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={page === totalPages}
              onClick={() => setPage(page + 1)}
            >
              Next
            </Button>
          </div>
        </div>
      )}

      {/* Sticky bulk action bar */}
      {selected.size > 0 && (
        <div className="fixed bottom-0 left-0 right-0 z-50 bg-gray-900 text-white px-4 py-3 flex flex-wrap items-center gap-3 shadow-2xl">
          <span className="text-sm font-medium">
            {selected.size} transaction{selected.size !== 1 ? "s" : ""} selected
          </span>
          <div className="flex items-center gap-2 flex-1 min-w-0">
            <Tag className="w-4 h-4 text-gray-400 shrink-0" />
            <Select
              value={bulkCatId}
              onValueChange={(v) => setBulkCatId(v ?? "")}
            >
              <SelectTrigger className="h-8 bg-gray-800 border-gray-700 text-white text-sm max-w-[200px]">
                <SelectValue placeholder="Pick category..." />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">— None (remove)</SelectItem>
                {categories.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    <div className="flex items-center gap-2">
                      <span
                        className="w-2 h-2 rounded-full"
                        style={{ backgroundColor: c.color }}
                      />
                      {c.name}
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              size="sm"
              disabled={!bulkCatId || applyingBulk}
              onClick={handleBulkCategorize}
              className="bg-blue-600 hover:bg-blue-700 text-white shrink-0"
            >
              {applyingBulk ? "Applying..." : "Apply"}
            </Button>
          </div>
          {bulkLinkEligible && (
            <Button
              size="sm"
              disabled={linkingBulk}
              onClick={handleBulkLink}
              className="bg-emerald-600 hover:bg-emerald-700 text-white shrink-0 gap-1"
            >
              <Link2 className="w-3.5 h-3.5" />
              {linkingBulk ? "Linking..." : "Link as transfer"}
            </Button>
          )}
          <Button
            size="sm"
            variant="ghost"
            className="text-gray-400 hover:text-white shrink-0"
            onClick={() => {
              setSelected(new Set());
              setBulkCatId("");
            }}
          >
            Clear selection
          </Button>
        </div>
      )}

      {/* Add manual transaction dialog */}
      <Dialog open={showAddDialog} onOpenChange={setShowAddDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Transaction</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>Account</Label>
              <Select
                value={addForm.accountId}
                onValueChange={(v) =>
                  setAddForm((f) => ({ ...f, accountId: v ?? f.accountId }))
                }
              >
                <SelectTrigger>
                  <SelectValue>
                    {accounts.find(a => a.id === addForm.accountId)?.name}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {accounts.map((a) => (
                    <SelectItem key={a.id} value={a.id}>
                      {a.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Date</Label>
                <Input
                  type="date"
                  value={addForm.date}
                  onChange={(e) =>
                    setAddForm((f) => ({ ...f, date: e.target.value }))
                  }
                />
              </div>
              <div className="space-y-2">
                <Label>Amount ($)</Label>
                <Input
                  type="number"
                  step="0.01"
                  min="0"
                  value={addForm.amount}
                  onChange={(e) =>
                    setAddForm((f) => ({ ...f, amount: e.target.value }))
                  }
                  placeholder="0.00"
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Description</Label>
              <Input
                value={addForm.description}
                onChange={(e) =>
                  setAddForm((f) => ({ ...f, description: e.target.value }))
                }
                placeholder="e.g. Tesco Grocery Shop"
              />
            </div>
            <div className="space-y-2">
              <Label>Type</Label>
              <Select
                value={addForm.isCredit ? "credit" : "debit"}
                onValueChange={(v) =>
                  setAddForm((f) => ({ ...f, isCredit: v === "credit" }))
                }
              >
                <SelectTrigger>
                  <SelectValue>
                    {addForm.isCredit ? "Credit (income / payment in)" : "Debit (expense / payment out)"}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="debit">
                    Debit (expense / payment out)
                  </SelectItem>
                  <SelectItem value="credit">
                    Credit (income / payment in)
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>
                Category <span className="text-gray-400">(optional)</span>
              </Label>
              <Select
                value={addForm.categoryId || "none"}
                onValueChange={(v) =>
                  setAddForm((f) => ({
                    ...f,
                    categoryId: v == null || v === "none" ? "" : v,
                  }))
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select category">
                    {addForm.categoryId ? categories.find(c => c.id === addForm.categoryId)?.name : undefined}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">— None</SelectItem>
                  {categories.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      <div className="flex items-center gap-2">
                        <span
                          className="w-2 h-2 rounded-full"
                          style={{ backgroundColor: c.color }}
                        />
                        {c.name}
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>
                Notes <span className="text-gray-400">(optional)</span>
              </Label>
              <textarea
                value={addForm.notes}
                onChange={(e) =>
                  setAddForm((f) => ({ ...f, notes: e.target.value }))
                }
                placeholder="Any additional notes..."
                className="w-full min-h-[72px] rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 resize-none"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAddDialog(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleAddTransaction}
              disabled={
                !addForm.description || !addForm.amount || !addForm.accountId
              }
            >
              Add
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit transaction dialog */}
      <Dialog open={!!editTx} onOpenChange={(open) => { if (!open) setEditTx(null); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Pencil className="w-4 h-4" />
              Edit Transaction
            </DialogTitle>
          </DialogHeader>
          {editTx && (
            <div className="space-y-4 py-2">
              <div className="space-y-2">
                <Label>Description / Merchant</Label>
                <Input
                  value={editForm.description}
                  onChange={(e) => setEditForm((f) => ({ ...f, description: e.target.value }))}
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label>Date</Label>
                  <Input
                    type="date"
                    value={editForm.date}
                    onChange={(e) => setEditForm((f) => ({ ...f, date: e.target.value }))}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Amount</Label>
                  <Input
                    type="number"
                    step="0.01"
                    min="0"
                    value={editForm.amount}
                    onChange={(e) => setEditForm((f) => ({ ...f, amount: e.target.value }))}
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label>Notes <span className="text-gray-400">(optional)</span></Label>
                <textarea
                  value={editForm.notes}
                  onChange={(e) => setEditForm((f) => ({ ...f, notes: e.target.value }))}
                  placeholder="Any notes..."
                  className="w-full min-h-[64px] rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring resize-none"
                />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditTx(null)}>Cancel</Button>
            <Button onClick={handleSaveEdit} disabled={savingEdit || !editForm.description || !editForm.amount}>
              {savingEdit ? "Saving..." : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Split transaction dialog */}
      <Dialog open={!!splitTx} onOpenChange={(open) => { if (!open) setSplitTx(null); }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Scissors className="w-4 h-4" />
              Split Transaction
            </DialogTitle>
          </DialogHeader>
          {splitTx && (
            <div className="space-y-4">
              <div className="bg-gray-50 rounded-lg p-3 text-sm">
                <p className="font-medium text-gray-900">
                  {splitTx.merchant ?? splitTx.description}
                </p>
                <p className="text-gray-500 text-xs mt-0.5">
                  Total: <span className="font-semibold text-gray-900">{formatCurrency(splitTx.amount)}</span>
                </p>
              </div>

              {/* Split rows */}
              <div className="space-y-3">
                {splitRows.map((row, i) => (
                  <div key={i} className="grid grid-cols-[1fr_auto_1fr_auto] gap-2 items-start">
                    <Select
                      value={row.categoryId || "none"}
                      onValueChange={(v) => {
                        const val = (v == null || v === "none") ? "" : String(v);
                        setSplitRows((rows) =>
                          rows.map((r, idx) => idx === i ? { ...r, categoryId: val } : r)
                        );
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
                        setSplitRows((rows) =>
                          rows.map((r, idx) => idx === i ? { ...r, amount: e.target.value } : r)
                        )
                      }
                      placeholder="0.00"
                      className="h-8 text-xs w-24"
                    />
                    <Input
                      value={row.note}
                      onChange={(e) =>
                        setSplitRows((rows) =>
                          rows.map((r, idx) => idx === i ? { ...r, note: e.target.value } : r)
                        )
                      }
                      placeholder="Note (optional)"
                      className="h-8 text-xs"
                    />
                    {splitRows.length > 2 && (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-gray-300 hover:text-red-500"
                        onClick={() =>
                          setSplitRows((rows) => rows.filter((_, idx) => idx !== i))
                        }
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    )}
                    {splitRows.length <= 2 && <div className="w-8" />}
                  </div>
                ))}
              </div>

              {/* Running total */}
              {(() => {
                const splitTotal = splitRows.reduce((s, r) => s + (parseFloat(r.amount) || 0), 0);
                const diff = Math.abs(splitTotal - splitTx.amount);
                const ok = diff <= 0.01;
                return (
                  <div className={`flex items-center justify-between text-sm px-1 ${ok ? "text-green-600" : "text-red-500"}`}>
                    <span>Split total: <strong>{formatCurrency(splitTotal)}</strong></span>
                    <span>
                      {ok ? "✓ Matches" : `${formatCurrency(diff)} ${splitTotal > splitTx.amount ? "over" : "remaining"}`}
                    </span>
                  </div>
                );
              })()}

              <Button
                variant="outline"
                size="sm"
                onClick={() =>
                  setSplitRows((rows) => [...rows, { categoryId: "", amount: "", note: "" }])
                }
                className="w-full"
              >
                <Plus className="w-3.5 h-3.5 mr-1.5" />
                Add split
              </Button>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setSplitTx(null)}>Cancel</Button>
            <Button
              onClick={handleSaveSplit}
              disabled={savingSplit || !splitTx || (() => {
                const t = splitRows.reduce((s, r) => s + (parseFloat(r.amount) || 0), 0);
                return Math.abs(t - (splitTx?.amount ?? 0)) > 0.01;
              })()}
            >
              {savingSplit ? "Saving..." : "Save splits"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Link transfer dialog */}
      <Dialog
        open={!!linkTransferTx}
        onOpenChange={(open) => {
          if (!open) setLinkTransferTx(null);
        }}
      >
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Link as Transfer</DialogTitle>
          </DialogHeader>
          {linkTransferTx && (
            <div className="space-y-4">
              <div className="bg-gray-50 rounded-lg p-3 text-sm">
                <p className="font-medium text-gray-900">
                  {linkTransferTx.merchant ?? linkTransferTx.description}
                </p>
                <p className="text-gray-500 text-xs mt-0.5">
                  {format(new Date(linkTransferTx.date), "dd MMM yyyy")} &middot;{" "}
                  {linkTransferTx.account.name} &middot;{" "}
                  {linkTransferTx.isCredit ? "+" : "−"}
                  {formatCurrency(linkTransferTx.amount)}
                </p>
              </div>
              <p className="text-sm text-gray-600">
                Select the matching transaction in the other account (showing
                transactions within ±7 days):
              </p>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <Input
                  value={transferSearch}
                  onChange={(e) => {
                    setTransferSearch(e.target.value);
                    fetchTransferCandidates(linkTransferTx, e.target.value);
                  }}
                  placeholder="Search matching transaction..."
                  className="pl-9"
                />
              </div>
              <div className="max-h-64 overflow-y-auto space-y-1 border border-gray-100 rounded-lg">
                {loadingCandidates ? (
                  <p className="text-center text-sm text-gray-400 py-4">
                    Loading...
                  </p>
                ) : transferCandidates.length === 0 ? (
                  <p className="text-center text-sm text-gray-400 py-4">
                    No transactions found
                  </p>
                ) : (
                  transferCandidates.map((t) => (
                    <label
                      key={t.id}
                      className={`flex items-center gap-3 px-3 py-2 cursor-pointer hover:bg-gray-50 rounded transition-colors ${
                        selectedPair === t.id ? "bg-blue-50" : ""
                      }`}
                    >
                      <input
                        type="radio"
                        name="transferPair"
                        value={t.id}
                        checked={selectedPair === t.id}
                        onChange={() => setSelectedPair(t.id)}
                        className="shrink-0"
                      />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-gray-900 truncate">
                          {t.merchant ?? t.description}
                        </p>
                        <p className="text-xs text-gray-400">
                          {format(new Date(t.date), "dd MMM yyyy")} &middot;{" "}
                          {t.account.name}
                        </p>
                      </div>
                      <span
                        className={`text-sm font-medium shrink-0 ${
                          t.isCredit ? "text-green-600" : "text-gray-900"
                        }`}
                      >
                        {t.isCredit ? "+" : "−"}
                        {formatCurrency(t.amount)}
                      </span>
                    </label>
                  ))
                )}
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setLinkTransferTx(null)}>
              Cancel
            </Button>
            <Button
              onClick={handleLinkTransfer}
              disabled={!selectedPair || linkingTransfer}
            >
              {linkingTransfer ? "Linking..." : "Link as Transfer"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={!!deleteTargetId}
        onOpenChange={(open) => { if (!open) setDeleteTargetId(null); }}
        title="Delete transaction?"
        description="This transaction will be permanently removed. This cannot be undone."
        confirmLabel="Delete"
        destructive
        onConfirm={handleDelete}
      />
    </div>
  );
}

export default function TransactionsPage() {
  return (
    <Suspense fallback={<div className="text-center py-12 text-gray-400">Loading...</div>}>
      <TransactionsContent />
    </Suspense>
  );
}
