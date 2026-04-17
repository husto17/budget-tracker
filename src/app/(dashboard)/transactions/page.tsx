"use client";

import { useState, useEffect, useCallback, useRef } from "react";
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

interface Category {
  id: string;
  name: string;
  color: string;
}

interface Account {
  id: string;
  name: string;
  type: string;
}

interface Transaction {
  id: string;
  date: string;
  description: string;
  merchant: string | null;
  amount: number;
  isCredit: boolean;
  category: Category | null;
  account: Account;
  notes: string | null;
  transferPairId: string | null;
  transferPair: { account: { id: string; name: string } } | null;
}

function formatCurrency(n: number) {
  return new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP" }).format(n);
}

export default function TransactionsPage() {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [categories, setCategories] = useState<Category[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);

  // Search with debounce
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [filterAccount, setFilterAccount] = useState("all");
  const [filterCategory, setFilterCategory] = useState("all");
  const [filterUncategorized, setFilterUncategorized] = useState(false);
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
    });
    const res = await fetch(`/api/transactions?${params}`);
    const data = await res.json();
    setTransactions(data.transactions);
    setTotal(data.total);
    setLoading(false);
  }, [page, filterAccount, filterCategory, filterUncategorized, search, from, to]);

  useEffect(() => {
    fetchTransactions();
  }, [fetchTransactions]);

  useEffect(() => {
    fetch("/api/categories")
      .then((r) => r.json())
      .then(setCategories);
    fetch("/api/accounts")
      .then((r) => r.json())
      .then((data) => {
        setAccounts(data);
        if (data.length > 0) setAddForm((f) => ({ ...f, accountId: data[0].id }));
      });
  }, []);

  // Debounce search input
  function handleSearchChange(value: string) {
    setSearchInput(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setSearch(value);
      setPage(1);
    }, 400);
  }

  async function updateCategory(txId: string, categoryId: string | null) {
    await fetch(`/api/transactions/${txId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ categoryId }),
    });
    fetchTransactions();
  }

  async function handleDelete(txId: string) {
    if (!confirm("Delete this transaction?")) return;
    const res = await fetch(`/api/transactions/${txId}`, { method: "DELETE" });
    if (res.ok) {
      toast.success("Deleted");
      fetchTransactions();
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
      toast.success(`Categorized ${selected.size} transactions`);
      setSelected(new Set());
      setBulkCatId("");
      fetchTransactions();
    } else {
      toast.error("Failed to apply categories");
    }
    setApplyingBulk(false);
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

  const totalPages = Math.ceil(total / LIMIT);

  return (
    <div className="space-y-6 pb-24">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Transactions</h1>
          <p className="text-sm text-gray-500 mt-1">{total.toLocaleString()} total</p>
        </div>
        <Button onClick={() => setShowAddDialog(true)} size="sm">
          <Plus className="w-4 h-4 mr-2" /> Add Manual
        </Button>
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
              placeholder="Search description..."
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
              <SelectValue placeholder="All accounts" />
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
              <SelectValue placeholder="All categories" />
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
          <div className="text-center py-12 text-gray-400">Loading...</div>
        ) : transactions.length === 0 ? (
          <div className="text-center py-12 text-gray-400">
            <ArrowUpDown className="w-10 h-10 mx-auto mb-3 opacity-30" />
            <p>No transactions found</p>
          </div>
        ) : (
          <>
            {/* Mobile card list */}
            <div className="md:hidden divide-y divide-gray-50">
              {transactions.map((tx) => (
                <div
                  key={tx.id}
                  className={`px-4 py-3 flex items-center gap-3 ${
                    selected.has(tx.id) ? "bg-blue-50" : ""
                  }`}
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
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className="text-xs text-gray-400">
                        {format(new Date(tx.date), "dd MMM yyyy")}
                      </span>
                      {tx.category && (
                        <span
                          className="inline-flex items-center gap-1 text-xs px-1.5 py-0.5 rounded-full"
                          style={{
                            backgroundColor: tx.category.color + "20",
                            color: tx.category.color,
                          }}
                        >
                          <span
                            className="w-1.5 h-1.5 rounded-full"
                            style={{ backgroundColor: tx.category.color }}
                          />
                          {tx.category.name}
                        </span>
                      )}
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
                    onClick={() => handleDelete(tx.id)}
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </Button>
                </div>
              ))}
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
                  {transactions.map((tx) => (
                    <tr
                      key={tx.id}
                      className={`hover:bg-gray-50 transition-colors ${
                        selected.has(tx.id) ? "bg-blue-50" : ""
                      }`}
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
                        <div className="flex items-center gap-2">
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
                                  <span
                                    className="w-2 h-2 rounded-full flex-shrink-0"
                                    style={{ backgroundColor: tx.category.color }}
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
                            onClick={() => handleDelete(tx.id)}
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
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
                  <SelectValue />
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
                <Label>Amount (£)</Label>
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
                  <SelectValue />
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
                  <SelectValue placeholder="Select category" />
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
    </div>
  );
}
