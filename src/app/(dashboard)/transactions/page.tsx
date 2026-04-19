"use client";

import { useState, useEffect, useCallback, useRef, useMemo, Fragment, Suspense } from "react";
import { format } from "date-fns";
import { useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { ArrowUpDown, Plus, Brain } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { fetchJson, FetchError } from "@/lib/fetcher";
import { TransactionDrawer } from "./transaction-drawer";
import type { Category, Account, Transaction } from "./types";
import { exportTransactionsCsv } from "./export-csv";
import { AddTransactionDialog } from "./AddTransactionDialog";
import { EditTransactionDialog } from "./EditTransactionDialog";
import { SplitTransactionDialog } from "./SplitTransactionDialog";
import { LinkTransferDialog } from "./LinkTransferDialog";
import { TransactionsFilters, type FilterState } from "./TransactionsFilters";
import { BulkActionBar } from "./BulkActionBar";
import {
  TransactionRow,
  TransactionCard,
  type PairInfo,
  type RowActions,
} from "./TransactionRow";

const LIMIT = 50;

function TransactionsContent() {
  const searchParams = useSearchParams();

  // ────── Data ──────
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [categories, setCategories] = useState<Category[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);

  // ────── Filters ──────
  const initialStatus = searchParams.get("status");
  const initialSearch = searchParams.get("search") ?? "";
  const initialFrom = searchParams.get("from") ?? "";
  const initialTo = searchParams.get("to") ?? "";
  // Default to current month when no date range is specified via URL.
  const defaultFrom = initialFrom || format(new Date(new Date().getFullYear(), new Date().getMonth(), 1), "yyyy-MM-dd");
  const defaultTo = initialTo || format(new Date(), "yyyy-MM-dd");
  const [filters, setFilters] = useState<FilterState>({
    searchInput: initialSearch,
    search: initialSearch,
    filterAccount: "all",
    filterCategory: "all",
    filterUncategorized: false,
    statusFilter:
      initialStatus === "pending" ? "pending" : initialStatus === "posted" ? "posted" : "all",
    from: defaultFrom,
    to: defaultTo,
    sort: "desc",
  });

  // ────── Selection + expanded pairs ──────
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [expandedPairs, setExpandedPairs] = useState<Set<string>>(new Set());

  // ────── Bulk actions ──────
  const [bulkCatId, setBulkCatId] = useState("");
  const [applyingBulk, setApplyingBulk] = useState(false);
  const [linkingBulk, setLinkingBulk] = useState(false);
  const [bulkWorking, setBulkWorking] = useState(false);

  // ────── Dialogs + drawer ──────
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [editTx, setEditTx] = useState<Transaction | null>(null);
  const [splitTx, setSplitTx] = useState<Transaction | null>(null);
  const [linkTx, setLinkTx] = useState<Transaction | null>(null);
  const [drawerTx, setDrawerTx] = useState<Transaction | null>(null);
  const [deleteTargetId, setDeleteTargetId] = useState<string | null>(null);

  // ────── Housekeeping ──────
  const [reprocessing, setReprocessing] = useState(false);
  const [exporting, setExporting] = useState(false);

  // Category-rule learning toggle — persists across page nav via sessionStorage
  const [learning, setLearning] = useState(true);
  useEffect(() => {
    if (typeof window === "undefined") return;
    const v = sessionStorage.getItem("transactions:learning");
    if (v === "false") setLearning(false);
  }, []);
  function toggleLearning() {
    setLearning((prev) => {
      const next = !prev;
      try { sessionStorage.setItem("transactions:learning", String(next)); } catch {}
      return next;
    });
  }

  // ────── Fetch transactions ──────
  // Monotonic request id guards against races — only the most recent fetch commits.
  const fetchIdRef = useRef(0);
  const fetchTransactions = useCallback(async () => {
    const myId = ++fetchIdRef.current;
    setLoading(true);
    const params = new URLSearchParams({
      page: String(page),
      limit: String(LIMIT),
      ...(filters.filterAccount !== "all" ? { accountId: filters.filterAccount } : {}),
      ...(filters.filterCategory !== "all" ? { categoryId: filters.filterCategory } : {}),
      ...(filters.filterUncategorized ? { uncategorized: "true" } : {}),
      ...(filters.search ? { search: filters.search } : {}),
      ...(filters.from ? { from: filters.from } : {}),
      ...(filters.to ? { to: filters.to } : {}),
      ...(filters.statusFilter !== "all" ? { status: filters.statusFilter } : {}),
      ...(filters.sort !== "desc" ? { sort: filters.sort } : {}),
    });
    try {
      const data = await fetchJson<{ transactions: Transaction[]; total: number }>(
        `/api/transactions?${params}`,
      );
      if (myId !== fetchIdRef.current) return;
      setTransactions(data.transactions);
      setTotal(data.total);
      setLoadError(null);
    } catch (e) {
      if (myId !== fetchIdRef.current) return;
      setLoadError(e instanceof FetchError ? e.message : "Couldn't load transactions");
    } finally {
      if (myId === fetchIdRef.current) setLoading(false);
    }
  }, [
    page,
    filters.filterAccount,
    filters.filterCategory,
    filters.filterUncategorized,
    filters.search,
    filters.from,
    filters.to,
    filters.statusFilter,
    filters.sort,
  ]);

  useEffect(() => {
    fetchTransactions();
  }, [fetchTransactions]);

  // Auto-correct page when results shrink (e.g. applied filter reduces 3 pages → 1).
  useEffect(() => {
    const totalPages = Math.ceil(total / LIMIT);
    if (total > 0 && page > totalPages) setPage(1);
  }, [total, page]);

  // ────── Initial category/account fetch + URL pre-filter ──────
  useEffect(() => {
    const catName = searchParams.get("categoryName");
    const catId = searchParams.get("categoryId");
    const accId = searchParams.get("accountId");
    fetchJson<Category[]>("/api/categories")
      .then((data) => {
        setCategories(data);
        if (catId) {
          setFilters((f) => ({ ...f, filterCategory: catId }));
        } else if (catName) {
          const match = data.find((c) => c.name.toLowerCase() === catName.toLowerCase());
          if (match) setFilters((f) => ({ ...f, filterCategory: match.id }));
        }
      })
      .catch(() => toast.error("Couldn't load categories"));
    fetchJson<Account[]>("/api/accounts")
      .then((data) => {
        setAccounts(data);
        if (accId) setFilters((f) => ({ ...f, filterAccount: accId }));
      })
      .catch(() => toast.error("Couldn't load accounts"));
  }, [searchParams]);

  // ────── Learn-from-category helper ──────
  const updateCategory = useCallback(
    async (txId: string, categoryId: string | null) => {
      try {
        const result = await fetchJson<{ learnedRuleId?: string | null; categoryId?: string | null }>(
          `/api/transactions/${txId}`,
          {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ categoryId, learn: learning }),
          },
        );
        fetchTransactions();
        if (result.learnedRuleId && result.categoryId) {
          const ruleId = result.learnedRuleId;
          const catId = result.categoryId;
          toast.success("Category updated", {
            action: {
              label: "Don't remember",
              onClick: async () => {
                try {
                  await fetchJson(`/api/categories/${catId}/rules?ruleId=${encodeURIComponent(ruleId)}`, {
                    method: "DELETE",
                  });
                  toast.success("Rule forgotten — future uploads won't auto-assign");
                } catch {
                  toast.error("Couldn't forget the rule");
                }
              },
            },
          });
        }
      } catch (e) {
        toast.error(e instanceof FetchError ? e.message : "Failed to update category", {
          action: { label: "Retry", onClick: () => updateCategory(txId, categoryId) },
        });
      }
    },
    [learning, fetchTransactions],
  );

  // ────── Pair-collapse info ──────
  const pairInfo = useMemo(() => {
    const byId = new Map(transactions.map((t) => [t.id, t]));
    const info = new Map<string, PairInfo>();
    const firstSeen = new Set<string>();
    for (const tx of transactions) {
      if (!tx.transferPairId) continue;
      const other = byId.get(tx.transferPairId);
      if (!other) continue;
      const pairKey = [tx.id, other.id].sort().join("_");
      const isFirst = !firstSeen.has(pairKey);
      if (isFirst) firstSeen.add(pairKey);
      info.set(tx.id, { pairKey, isFirst, other });
    }
    return info;
  }, [transactions]);

  // ────── Selection helpers ──────
  function toggleSelect(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }
  function togglePairSelect(a: string, b: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      const both = next.has(a) && next.has(b);
      if (both) { next.delete(a); next.delete(b); }
      else { next.add(a); next.add(b); }
      return next;
    });
  }
  function togglePairExpanded(pairKey: string) {
    setExpandedPairs((prev) => {
      const next = new Set(prev);
      if (next.has(pairKey)) next.delete(pairKey);
      else next.add(pairKey);
      return next;
    });
  }

  // ────── Transfer helpers ──────
  async function handleUnlinkTransfer(txId: string) {
    const res = await fetch(`/api/transactions/${txId}/transfer`, { method: "DELETE" });
    if (res.ok) {
      toast.success("Transfer unlinked");
      fetchTransactions();
    } else {
      toast.error("Failed to unlink transfer");
    }
  }

  // ────── Bulk actions ──────
  async function handleBulkCategorize() {
    if (!bulkCatId || selected.size === 0) return;
    setApplyingBulk(true);
    const categoryId = bulkCatId === "__none__" ? null : bulkCatId;
    const res = await fetch("/api/transactions/bulk", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ transactionIds: Array.from(selected), categoryId }),
    });
    if (res.ok) {
      const prevIds = Array.from(selected);
      const prevCategoryIds = prevIds.map(
        (id) => transactions.find((t) => t.id === id)?.category?.id ?? null,
      );
      setSelected(new Set());
      setBulkCatId("");
      fetchTransactions();
      toast.success(`Categorized ${prevIds.length} transactions`, {
        action: {
          label: "Undo",
          onClick: async () => {
            await Promise.all(
              prevIds.map((id, i) =>
                fetch(`/api/transactions/${id}`, {
                  method: "PATCH",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ categoryId: prevCategoryIds[i] }),
                }),
              ),
            );
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

  // Bulk-link — exactly 2 selected, different accounts, opposite signs, same amount
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

  async function handleBulkExclude() {
    if (selected.size === 0) return;
    setBulkWorking(true);
    const ids = Array.from(selected);
    const res = await fetch("/api/transactions/bulk", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ transactionIds: ids, patch: { isExcluded: true } }),
    });
    if (res.ok) {
      setSelected(new Set());
      fetchTransactions();
      toast.success(`Excluded ${ids.length} transaction${ids.length !== 1 ? "s" : ""} from totals`, {
        action: {
          label: "Undo",
          onClick: async () => {
            await fetch("/api/transactions/bulk", {
              method: "PUT",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ transactionIds: ids, patch: { isExcluded: false } }),
            });
            fetchTransactions();
          },
        },
      });
    } else {
      toast.error("Failed to exclude transactions");
    }
    setBulkWorking(false);
  }

  async function handleBulkDelete() {
    if (selected.size === 0) return;
    setBulkWorking(true);
    const ids = Array.from(selected);
    const res = await fetch("/api/transactions/bulk", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ transactionIds: ids, patch: { deletedAt: true } }),
    });
    if (res.ok) {
      setSelected(new Set());
      fetchTransactions();
      toast.success(`Deleted ${ids.length} transaction${ids.length !== 1 ? "s" : ""}`);
    } else {
      toast.error("Failed to delete transactions");
    }
    setBulkWorking(false);
  }

  // ────── Delete ──────
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

  // ────── Reprocess (merchant normalize + auto-categorize) ──────
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

  useEffect(() => {
    if (typeof window === "undefined") return;
    const REPROCESS_VERSION = "2026-04-18-v3";
    if (sessionStorage.getItem("transactionsReprocessedVersion") === REPROCESS_VERSION) return;
    sessionStorage.setItem("transactionsReprocessedVersion", REPROCESS_VERSION);
    reprocessNames(true);
  }, [reprocessNames]);

  async function exportCsv() {
    setExporting(true);
    try {
      const count = await exportTransactionsCsv({
        accountId: filters.filterAccount,
        categoryId: filters.filterCategory,
        uncategorized: filters.filterUncategorized,
        search: filters.search,
        from: filters.from,
        to: filters.to,
        status: filters.statusFilter,
      });
      toast.success(`Exported ${count} transactions`);
    } catch (e) {
      toast.error(e instanceof FetchError ? e.message : "Couldn't export");
    } finally {
      setExporting(false);
    }
  }

  // ────── Row actions (passed to row/card) ──────
  const rowActions: RowActions = {
    onToggleSelect: toggleSelect,
    onTogglePairSelect: togglePairSelect,
    onTogglePairExpanded: togglePairExpanded,
    onOpenDrawer: setDrawerTx,
    onUpdateCategory: updateCategory,
    onOpenEdit: setEditTx,
    onOpenSplit: setSplitTx,
    onLinkTransfer: setLinkTx,
    onUnlinkTransfer: handleUnlinkTransfer,
    onRequestDelete: setDeleteTargetId,
  };

  const totalPages = Math.ceil(total / LIMIT);

  return (
    <div className="space-y-6 pb-24">
      {/* Header */}
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Transactions</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
            {total.toLocaleString()} total
          </p>
        </div>
        <div className="flex gap-2 items-center flex-wrap">
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 text-gray-500 dark:text-gray-400"
            onClick={toggleLearning}
            title={
              learning
                ? "Learning ON — each category pick saves a merchant rule. Click to pause."
                : "Learning PAUSED — category picks are one-off. Click to resume."
            }
            aria-label={learning ? "Pause rule learning" : "Resume rule learning"}
          >
            <Brain className={`w-4 h-4 ${learning ? "" : "opacity-40"}`} />
          </Button>
          <Button variant="outline" size="sm" onClick={() => reprocessNames(false)} disabled={reprocessing}>
            {reprocessing ? "Cleaning..." : "Clean up + categorize"}
          </Button>
          <Button onClick={() => setShowAddDialog(true)} size="sm">
            <Plus className="w-4 h-4 mr-2" /> Add Manual
          </Button>
        </div>
      </div>

      {/* Learning-paused banner — only shown when learning is off */}
      {!learning && (
        <div className="flex items-center justify-between gap-3 px-4 py-2.5 rounded-xl border bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-800/60 text-amber-900 dark:text-amber-200">
          <div className="flex items-start gap-2 min-w-0">
            <span className="text-lg leading-none shrink-0 mt-0.5">⏸</span>
            <div className="min-w-0">
              <p className="text-sm font-semibold">Learning is paused</p>
              <p className="text-xs opacity-80">
                Category picks apply to this transaction only — no rules will be created.
              </p>
            </div>
          </div>
          <Button
            size="sm"
            variant="outline"
            onClick={toggleLearning}
            className="bg-white dark:bg-gray-900 hover:bg-amber-100 dark:hover:bg-amber-900/30"
          >
            Resume learning
          </Button>
        </div>
      )}

      <TransactionsFilters
        accounts={accounts}
        categories={categories}
        filters={filters}
        onFilterChange={(next) => setFilters((f) => ({ ...f, ...next }))}
        onResetPage={() => { setPage(1); setSelected(new Set()); }}
        onExport={exportCsv}
        exporting={exporting}
        disableExport={total === 0}
      />

      {/* Table + mobile cards */}
      <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl overflow-hidden">
        {loading ? (
          <div className="divide-y divide-gray-50 dark:divide-gray-800">
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
          <div className="text-center py-12 text-gray-400 dark:text-gray-500">
            <ArrowUpDown className="w-10 h-10 mx-auto mb-3 opacity-30" />
            <p>No transactions found</p>
          </div>
        ) : (
          <>
            <div className="md:hidden divide-y divide-gray-50 dark:divide-gray-800">
              {transactions.map((tx) => {
                const info = pairInfo.get(tx.id);
                if (info && !info.isFirst && !expandedPairs.has(info.pairKey)) return null;
                return (
                  <Fragment key={tx.id}>
                    <TransactionCard
                      tx={tx}
                      info={info}
                      isExpanded={info ? expandedPairs.has(info.pairKey) : false}
                      isSelected={selected.has(tx.id)}
                      categories={categories}
                      actions={rowActions}
                      bothPairSelected={
                        info ? selected.has(tx.id) && selected.has(info.other.id) : false
                      }
                    />
                  </Fragment>
                );
              })}
            </div>

            <div className="hidden md:block overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-gray-100 dark:border-gray-800 text-xs text-gray-400 dark:text-gray-500 uppercase tracking-wide">
                    <th className="px-4 py-3 text-left w-8">
                      <input
                        type="checkbox"
                        checked={selected.size === transactions.length && transactions.length > 0}
                        onChange={(e) => {
                          if (e.target.checked) setSelected(new Set(transactions.map((t) => t.id)));
                          else setSelected(new Set());
                        }}
                        aria-label="Select all transactions on this page"
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
                <tbody className="divide-y divide-gray-50 dark:divide-gray-800">
                  {transactions.map((tx) => {
                    const info = pairInfo.get(tx.id);
                    if (info && !info.isFirst && !expandedPairs.has(info.pairKey)) return null;
                    return (
                      <Fragment key={tx.id}>
                        <TransactionRow
                          tx={tx}
                          info={info}
                          isExpanded={info ? expandedPairs.has(info.pairKey) : false}
                          isSelected={selected.has(tx.id)}
                          categories={categories}
                          actions={rowActions}
                          bothPairSelected={
                            info ? selected.has(tx.id) && selected.has(info.other.id) : false
                          }
                        />
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
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Showing {(page - 1) * LIMIT + 1}–{Math.min(page * LIMIT, total)} of {total}
          </p>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" disabled={page === 1} onClick={() => setPage(page - 1)}>
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

      <BulkActionBar
        count={selected.size}
        categories={categories}
        bulkCatId={bulkCatId}
        onBulkCatIdChange={setBulkCatId}
        applyingBulk={applyingBulk}
        onApply={handleBulkCategorize}
        bulkLinkEligible={bulkLinkEligible}
        linkingBulk={linkingBulk}
        onLink={handleBulkLink}
        onExclude={handleBulkExclude}
        onDelete={handleBulkDelete}
        working={bulkWorking}
        onClear={() => {
          setSelected(new Set());
          setBulkCatId("");
        }}
      />

      <AddTransactionDialog
        open={showAddDialog}
        onOpenChange={setShowAddDialog}
        accounts={accounts}
        categories={categories}
        onAdded={fetchTransactions}
      />
      <EditTransactionDialog
        tx={editTx}
        onClose={() => setEditTx(null)}
        onSaved={fetchTransactions}
      />
      <SplitTransactionDialog
        tx={splitTx}
        onClose={() => setSplitTx(null)}
        onSaved={fetchTransactions}
        categories={categories}
      />
      <LinkTransferDialog
        tx={linkTx}
        onClose={() => setLinkTx(null)}
        onLinked={fetchTransactions}
      />

      <ConfirmDialog
        open={!!deleteTargetId}
        onOpenChange={(open) => { if (!open) setDeleteTargetId(null); }}
        title="Delete transaction?"
        description="This transaction will be moved to the trash and hidden from all views."
        confirmLabel="Delete"
        destructive
        onConfirm={handleDelete}
      />

      <TransactionDrawer
        tx={drawerTx}
        onClose={() => setDrawerTx(null)}
        categories={categories}
        onChanged={fetchTransactions}
        onSplit={(t) => { setDrawerTx(null); setSplitTx(t); }}
        onLinkTransfer={(t) => { setDrawerTx(null); setLinkTx(t); }}
        onUnlinkTransfer={(txId) => { setDrawerTx(null); handleUnlinkTransfer(txId); }}
        onDelete={(txId) => { setDrawerTx(null); setDeleteTargetId(txId); }}
      />
    </div>
  );
}

export default function TransactionsPage() {
  return (
    <Suspense fallback={<div className="text-center py-12 text-gray-400 dark:text-gray-500">Loading...</div>}>
      <TransactionsContent />
    </Suspense>
  );
}
