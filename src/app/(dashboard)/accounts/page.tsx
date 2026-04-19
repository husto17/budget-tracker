"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { Plus, Pencil, Trash2, CreditCard, Landmark, Wallet, PiggyBank, DollarSign, ArrowRight, Upload as UploadIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { fetchJson, FetchError, formatCurrency } from "@/lib/fetcher";
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
import { Badge } from "@/components/ui/badge";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Skeleton } from "@/components/ui/skeleton";

const ACCOUNT_TYPES = [
  { value: "CHECKING", label: "Current / Checking", icon: Landmark },
  { value: "SAVINGS", label: "Savings", icon: PiggyBank },
  { value: "CREDIT_CARD", label: "Credit Card", icon: CreditCard },
  { value: "CASH", label: "Cash", icon: Wallet },
  { value: "INVESTMENT", label: "Investment", icon: DollarSign },
  { value: "OTHER", label: "Other", icon: Wallet },
];

function AccountIcon({ type }: { type: string }) {
  const found = ACCOUNT_TYPES.find((t) => t.value === type);
  const Icon = found?.icon ?? Wallet;
  return <Icon className="w-5 h-5" />;
}

type Warning =
  | { type: "missing_statement"; afterDate: string; gapDays: number; afterFile: string }
  | { type: "overlap_statement"; fileA: string; fileB: string }
  | { type: "half_linked_transfers"; count: number };

interface Account {
  id: string;
  name: string;
  type: string;
  institution: string | null;
  lastFour: string | null;
  isJoint: boolean;
  openingBalance: number | null;
  openingBalanceDate: string | null;
  computedBalance: number;
  reconciledBalance: number | null;
  latestStatement: {
    fileName: string;
    closingBalance: number;
    statementEnd: string;
  } | null;
  warnings: Warning[];
  owner: "me" | "partner";
  _count: { transactions: number };
}

export default function AccountsPage() {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [showDialog, setShowDialog] = useState(false);
  const [editingAccount, setEditingAccount] = useState<Account | null>(null);
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Account | null>(null);

  const [form, setForm] = useState({
    name: "",
    type: "CHECKING",
    institution: "",
    lastFour: "",
    isJoint: false,
    openingBalance: "",
    openingBalanceDate: "",
  });

  async function fetchAccounts() {
    try {
      const data = await fetchJson<Account[]>("/api/accounts");
      setAccounts(data);
      setLoadError(null);
    } catch (e) {
      setLoadError(e instanceof FetchError ? e.message : "Couldn't load accounts");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { fetchAccounts(); }, []);

  function openAdd() {
    setEditingAccount(null);
    setForm({
      name: "",
      type: "CHECKING",
      institution: "",
      lastFour: "",
      isJoint: false,
      openingBalance: "",
      openingBalanceDate: "",
    });
    setShowDialog(true);
  }

  function openEdit(account: Account) {
    setEditingAccount(account);
    setForm({
      name: account.name,
      type: account.type,
      institution: account.institution ?? "",
      lastFour: account.lastFour ?? "",
      isJoint: account.isJoint,
      openingBalance: account.openingBalance != null ? String(account.openingBalance) : "",
      openingBalanceDate: account.openingBalanceDate ? account.openingBalanceDate.slice(0, 10) : "",
    });
    setShowDialog(true);
  }

  async function handleSave() {
    setSaving(true);
    const url = editingAccount ? `/api/accounts/${editingAccount.id}` : "/api/accounts";
    const method = editingAccount ? "PATCH" : "POST";

    const res = await fetch(url, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });

    if (res.ok) {
      toast.success(editingAccount ? "Account updated" : "Account added");
      setShowDialog(false);
      fetchAccounts();
    } else {
      const data = await res.json().catch(() => ({}));
      toast.error(data.error ?? "Something went wrong", {
        action: { label: "Retry", onClick: handleSave },
      });
    }
    setSaving(false);
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    const res = await fetch(`/api/accounts/${deleteTarget.id}`, { method: "DELETE" });
    if (res.ok) {
      toast.success("Account deleted");
      fetchAccounts();
    } else {
      toast.error("Failed to delete account");
      throw new Error("delete failed");
    }
  }

  async function repairTransfers(accountId: string) {
    try {
      const res = await fetch(`/api/accounts/${accountId}/repair`, { method: "POST" });
      if (!res.ok) throw new Error("failed");
      const data = await res.json();
      toast.success(`Unlinked ${data.fixed} orphan${data.fixed === 1 ? "" : "s"}`);
      fetchAccounts();
    } catch {
      toast.error("Couldn't repair transfers");
    }
  }

  async function cleanOverlaps(accountId: string) {
    try {
      const res = await fetch(`/api/accounts/${accountId}/clean-overlaps`, { method: "POST" });
      if (!res.ok) throw new Error("failed");
      const data = await res.json();
      if (data.deleted === 0) {
        toast.info("No empty duplicate uploads to remove");
      } else {
        toast.success(`Removed ${data.deleted} duplicate upload${data.deleted === 1 ? "" : "s"}`);
      }
      fetchAccounts();
    } catch {
      toast.error("Couldn't clean up overlaps");
    }
  }

  const totalBalance = accounts.reduce((sum, a) => {
    if (a.type === "CREDIT_CARD") return sum - Math.abs(a.computedBalance);
    return sum + a.computedBalance;
  }, 0);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Accounts</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">Manage your bank accounts and credit cards</p>
        </div>
        <Button onClick={openAdd}>
          <Plus className="w-4 h-4 mr-2" />
          Add Account
        </Button>
      </div>

      {/* Net worth summary */}
      <Card className="bg-gradient-to-r from-blue-600 to-blue-700 text-white border-0">
        <CardContent className="pt-6">
          <p className="text-blue-100 text-sm font-medium">Net Balance</p>
          <p className="text-4xl font-bold mt-1">{formatCurrency(totalBalance)}</p>
          <p className="text-blue-200 text-sm mt-2">Across {accounts.length} accounts</p>
        </CardContent>
      </Card>

      {loading ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Card key={i}>
              <CardHeader className="pb-3">
                <div className="flex items-center gap-3">
                  <Skeleton className="w-10 h-10 rounded-lg" />
                  <div className="flex-1 space-y-2">
                    <Skeleton className="h-4 w-24" />
                    <Skeleton className="h-3 w-32" />
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <Skeleton className="h-7 w-28" />
              </CardContent>
            </Card>
          ))}
        </div>
      ) : loadError ? (
        <div className="text-center py-12">
          <p className="text-sm text-red-600 font-medium">{loadError}</p>
          <Button variant="outline" size="sm" className="mt-3" onClick={() => { setLoading(true); fetchAccounts(); }}>
            Try again
          </Button>
        </div>
      ) : accounts.length === 0 ? (
        <div className="text-center py-12 text-gray-400 dark:text-gray-500">
          <Landmark className="w-12 h-12 mx-auto mb-3 opacity-30" />
          <p className="font-medium">No accounts yet</p>
          <p className="text-sm mt-1">Add your first bank account to get started</p>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {accounts.map((account) => {
            const typeInfo = ACCOUNT_TYPES.find((t) => t.value === account.type);
            const isCredit = account.type === "CREDIT_CARD";
            const balance = isCredit ? -account.computedBalance : account.computedBalance;

            return (
              <Card key={account.id} className="hover:shadow-md transition-shadow">
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-lg bg-gray-100 dark:bg-gray-800 flex items-center justify-center text-gray-600 dark:text-gray-300">
                        <AccountIcon type={account.type} />
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <CardTitle className="text-base">{account.name}</CardTitle>
                          {account.isJoint && (
                            <Badge variant="secondary" className="text-xs bg-purple-100 text-purple-700">Joint</Badge>
                          )}
                          {account.owner === "partner" && (
                            <Badge variant="secondary" className="text-xs bg-blue-100 text-blue-700">Partner&apos;s</Badge>
                          )}
                        </div>
                        <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">
                          {account.institution ?? typeInfo?.label}
                          {account.lastFour && ` •••• ${account.lastFour}`}
                        </p>
                      </div>
                    </div>
                    <div className="flex gap-1">
                      <Link href={`/upload?accountId=${account.id}`}>
                        <Button variant="ghost" size="icon" className="h-8 w-8" title="Upload statement for this account">
                          <UploadIcon className="w-3.5 h-3.5" />
                        </Button>
                      </Link>
                      <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEdit(account)}>
                        <Pencil className="w-3.5 h-3.5" />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-8 w-8 text-red-400 hover:text-red-600" onClick={() => setDeleteTarget(account)}>
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="flex items-end justify-between">
                    <div>
                      <p className={`text-2xl font-bold ${isCredit && balance > 0 ? "text-red-600" : "text-gray-900 dark:text-gray-100"}`}>
                        {formatCurrency(balance)}
                      </p>
                      {isCredit && balance > 0 && (
                        <p className="text-xs text-red-500 mt-0.5">Outstanding balance</p>
                      )}
                    </div>
                    <Link
                      href={`/transactions?accountId=${account.id}`}
                      className="inline-flex items-center gap-1 text-xs text-blue-600 hover:text-blue-700 hover:underline"
                    >
                      {account._count.transactions} transactions
                      <ArrowRight className="w-3 h-3" />
                    </Link>
                  </div>
                  {/* Reconciliation chip — only visible when we have a statement reference */}
                  {account.reconciledBalance !== null && account.latestStatement && (() => {
                    const diff = account.computedBalance - account.reconciledBalance;
                    const aligned = Math.abs(diff) <= 0.01;
                    return (
                      <div
                        className={`mt-3 pt-3 border-t border-gray-100 dark:border-gray-800 flex items-center justify-between gap-2 text-xs ${
                          aligned ? "text-emerald-600 dark:text-emerald-400" : "text-amber-600 dark:text-amber-400"
                        }`}
                        title={`Statement "${account.latestStatement.fileName}" closed at ${formatCurrency(
                          account.latestStatement.closingBalance,
                        )} on ${new Date(account.latestStatement.statementEnd).toLocaleDateString()}`}
                      >
                        <span className="font-medium">
                          {aligned ? "✓ Matches statement" : `⚠ Off by ${formatCurrency(Math.abs(diff))}`}
                        </span>
                        <span className="text-gray-400 dark:text-gray-500 tabular-nums">
                          Statement: {formatCurrency(account.latestStatement.closingBalance)}
                        </span>
                      </div>
                    );
                  })()}
                  {/* Manual anchor indicator — dim hint when user has set an opening balance */}
                  {account.reconciledBalance === null && account.openingBalance != null && account.openingBalanceDate && (
                    <div className="mt-3 pt-3 border-t border-gray-100 dark:border-gray-800 text-xs text-gray-400 dark:text-gray-500">
                      Anchor: {formatCurrency(account.openingBalance)} on{" "}
                      {new Date(account.openingBalanceDate).toLocaleDateString()}
                    </div>
                  )}
                  {/* Warnings — shown regardless of reconciliation state */}
                  {account.warnings && account.warnings.length > 0 && (
                    <div className="mt-3 pt-3 border-t border-gray-100 dark:border-gray-800 space-y-1.5">
                      {account.warnings.map((w, i) => (
                        <div key={i} className="text-xs text-amber-700 dark:text-amber-300 flex items-start justify-between gap-2">
                          <div className="flex items-start gap-1.5 min-w-0">
                            <span className="leading-4">•</span>
                            <span className="leading-4 min-w-0">
                              {w.type === "missing_statement" && (
                                <>
                                  <span className="font-medium">Missing statement</span>{" "}
                                  after {new Date(w.afterDate).toLocaleDateString()}{" "}
                                  <span className="text-gray-400 dark:text-gray-500">({w.gapDays}d gap)</span>
                                </>
                              )}
                              {w.type === "overlap_statement" && (
                                <>
                                  <span className="font-medium">Overlapping uploads:</span>{" "}
                                  <span className="text-gray-500 dark:text-gray-400 truncate">{w.fileA}</span>{" "}
                                  <span className="text-gray-400 dark:text-gray-500">vs</span>{" "}
                                  <span className="text-gray-500 dark:text-gray-400 truncate">{w.fileB}</span>
                                </>
                              )}
                              {w.type === "half_linked_transfers" && (
                                <>
                                  <span className="font-medium">{w.count} half-linked transfer{w.count !== 1 ? "s" : ""}</span>
                                  {" "}— the other side is missing
                                </>
                              )}
                            </span>
                          </div>
                          {w.type === "missing_statement" && (
                            <Link
                              href={`/upload?accountId=${account.id}`}
                              className="text-xs font-medium text-blue-600 hover:underline shrink-0"
                            >
                              Upload
                            </Link>
                          )}
                          {w.type === "overlap_statement" && (
                            <button
                              onClick={() => cleanOverlaps(account.id)}
                              className="text-xs font-medium text-blue-600 hover:underline shrink-0"
                            >
                              Clean up
                            </button>
                          )}
                          {w.type === "half_linked_transfers" && (
                            <button
                              onClick={() => repairTransfers(account.id)}
                              className="text-xs font-medium text-blue-600 hover:underline shrink-0"
                            >
                              Fix
                            </button>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingAccount ? "Edit Account" : "Add Account"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>Account Name</Label>
              <Input
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                placeholder="e.g. Barclays Current"
              />
            </div>
            <div className="space-y-2">
              <Label>Account Type</Label>
              <Select value={form.type} onValueChange={(v) => setForm((f) => ({ ...f, type: v ?? f.type }))}>
                <SelectTrigger>
                  <SelectValue>
                    {ACCOUNT_TYPES.find(t => t.value === form.type)?.label}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {ACCOUNT_TYPES.map((t) => (
                    <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Bank / Institution <span className="text-gray-400 dark:text-gray-500">(optional)</span></Label>
              <Input
                value={form.institution}
                onChange={(e) => setForm((f) => ({ ...f, institution: e.target.value }))}
                placeholder="e.g. Barclays"
              />
            </div>
            <div className="space-y-2">
              <Label>Last 4 digits <span className="text-gray-400 dark:text-gray-500">(optional)</span></Label>
              <Input
                value={form.lastFour}
                onChange={(e) => setForm((f) => ({ ...f, lastFour: e.target.value }))}
                placeholder="1234"
                maxLength={4}
              />
            </div>
            <div className="flex items-center gap-2">
              <input
                id="isJoint"
                type="checkbox"
                checked={form.isJoint}
                onChange={(e) => setForm((f) => ({ ...f, isJoint: e.target.checked }))}
                className="h-4 w-4 rounded border-gray-300"
              />
              <Label htmlFor="isJoint" className="cursor-pointer">Joint account (shared with partner)</Label>
            </div>
            <div className="pt-3 border-t border-gray-100 dark:border-gray-800 space-y-3">
              <div>
                <Label>Opening balance <span className="text-gray-400 dark:text-gray-500">(optional)</span></Label>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 mb-2">
                  Set this if your imported statements don&apos;t go back to the account&apos;s opening — the balance shown will include this anchor.
                </p>
                <div className="grid grid-cols-2 gap-2">
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 dark:text-gray-500 text-sm">$</span>
                    <Input
                      type="number"
                      step="0.01"
                      value={form.openingBalance}
                      onChange={(e) => setForm((f) => ({ ...f, openingBalance: e.target.value }))}
                      placeholder="0.00"
                      className="pl-7"
                    />
                  </div>
                  <Input
                    type="date"
                    value={form.openingBalanceDate}
                    onChange={(e) => setForm((f) => ({ ...f, openingBalanceDate: e.target.value }))}
                    placeholder="As of date"
                  />
                </div>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDialog(false)}>Cancel</Button>
            <Button onClick={handleSave} disabled={saving || !form.name}>
              {saving ? "Saving..." : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={!!deleteTarget}
        onOpenChange={(open) => { if (!open) setDeleteTarget(null); }}
        title="Delete account?"
        description={
          deleteTarget ? (
            <>
              Delete <strong>&ldquo;{deleteTarget.name}&rdquo;</strong>? This will also delete all{" "}
              {deleteTarget._count.transactions} associated transaction
              {deleteTarget._count.transactions !== 1 ? "s" : ""}. This cannot be undone.
            </>
          ) : null
        }
        confirmLabel="Delete"
        destructive
        onConfirm={handleDelete}
      />
    </div>
  );
}
