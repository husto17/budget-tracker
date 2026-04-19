"use client";

import { useState, useEffect, useMemo } from "react";
import { format } from "date-fns";
import { CheckCircle2, Circle, AlertTriangle, ArrowRight } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { formatCurrency } from "@/lib/fetcher";

interface TxRow {
  id: string;
  date: string;
  description: string;
  merchant: string | null;
  amount: number;
  isCredit: boolean;
  isReconciled: boolean;
  category: { name: string; color: string } | null;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  accountId: string;
  accountName: string;
  openingBalance: number;
}

type Step = "setup" | "review" | "done";

export function ReconcileWizardDialog({ open, onOpenChange, accountId, accountName, openingBalance }: Props) {
  const [step, setStep] = useState<Step>("setup");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [closingBalance, setClosingBalance] = useState("");
  const [transactions, setTransactions] = useState<TxRow[]>([]);
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  // Reset when dialog closes
  useEffect(() => {
    if (!open) {
      setStep("setup");
      setFrom("");
      setTo("");
      setClosingBalance("");
      setTransactions([]);
      setChecked(new Set());
    }
  }, [open]);

  async function fetchTransactions() {
    if (!from || !to) {
      toast.error("Please enter a date range");
      return;
    }
    setLoading(true);
    try {
      const params = new URLSearchParams({ from, to });
      const res = await fetch(`/api/accounts/${accountId}/reconcile?${params}`);
      if (!res.ok) throw new Error("Failed to load");
      const data: TxRow[] = await res.json();
      setTransactions(data);
      // Pre-check already-reconciled transactions
      setChecked(new Set(data.filter((t) => t.isReconciled).map((t) => t.id)));
      setStep("review");
    } catch {
      toast.error("Couldn't load transactions");
    } finally {
      setLoading(false);
    }
  }

  async function confirmReconcile() {
    setSaving(true);
    try {
      const ids = Array.from(checked);
      const res = await fetch(`/api/accounts/${accountId}/reconcile`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ transactionIds: ids }),
      });
      if (!res.ok) throw new Error("Failed");
      const data = await res.json();
      toast.success(`Reconciled ${data.reconciled} transaction${data.reconciled !== 1 ? "s" : ""}`);
      setStep("done");
    } catch {
      toast.error("Failed to save reconciliation");
    } finally {
      setSaving(false);
    }
  }

  // Running balance: start from openingBalance, apply all checked transactions in date order
  const { runningBalance, difference } = useMemo(() => {
    const sorted = [...transactions].sort((a, b) => a.date.localeCompare(b.date));
    let bal = openingBalance;
    for (const tx of sorted) {
      if (!checked.has(tx.id)) continue;
      bal += tx.isCredit ? tx.amount : -tx.amount;
    }
    const expected = parseFloat(closingBalance) || 0;
    return { runningBalance: bal, difference: bal - expected };
  }, [transactions, checked, openingBalance, closingBalance]);

  const balanced = Math.abs(difference) < 0.01;

  function toggleAll() {
    if (checked.size === transactions.length) {
      setChecked(new Set());
    } else {
      setChecked(new Set(transactions.map((t) => t.id)));
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Reconcile — {accountName}</DialogTitle>
        </DialogHeader>

        {/* Step indicator */}
        <div className="flex items-center gap-2 text-xs text-gray-400 dark:text-gray-500 mb-2">
          {(["setup", "review", "done"] as Step[]).map((s, i) => (
            <span key={s} className="flex items-center gap-1.5">
              {i > 0 && <ArrowRight className="w-3 h-3" />}
              <span className={step === s ? "text-indigo-600 font-semibold" : ""}>
                {s === "setup" ? "1 · Setup" : s === "review" ? "2 · Review" : "3 · Done"}
              </span>
            </span>
          ))}
        </div>

        {/* Step 1: Setup */}
        {step === "setup" && (
          <div className="space-y-4 py-2">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Statement start</Label>
                <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label>Statement end</Label>
                <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Statement closing balance</Label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 dark:text-gray-500 text-sm">$</span>
                <Input
                  type="number"
                  step="0.01"
                  value={closingBalance}
                  onChange={(e) => setClosingBalance(e.target.value)}
                  placeholder="0.00"
                  className="pl-7"
                />
              </div>
              <p className="text-xs text-gray-400 dark:text-gray-500">
                Opening balance used: {formatCurrency(openingBalance)}
              </p>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
              <Button onClick={fetchTransactions} disabled={loading || !from || !to}>
                {loading ? "Loading..." : "Continue"}
              </Button>
            </DialogFooter>
          </div>
        )}

        {/* Step 2: Review */}
        {step === "review" && (
          <>
            {/* Summary bar */}
            <div className={`flex items-center justify-between px-4 py-2.5 rounded-lg text-sm ${
              balanced ? "bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800" :
              "bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800"
            }`}>
              <div className="flex items-center gap-2">
                {balanced
                  ? <CheckCircle2 className="w-4 h-4 text-green-600" />
                  : <AlertTriangle className="w-4 h-4 text-amber-600" />}
                <span className={balanced ? "text-green-800 font-medium" : "text-amber-800 font-medium"}>
                  {balanced ? "Balanced" : `Off by ${formatCurrency(Math.abs(difference))}`}
                </span>
              </div>
              <div className="text-right text-xs space-y-0.5">
                <p className="text-gray-500 dark:text-gray-400">Calculated: <strong>{formatCurrency(runningBalance)}</strong></p>
                <p className="text-gray-500 dark:text-gray-400">Expected: <strong>{formatCurrency(parseFloat(closingBalance) || 0)}</strong></p>
              </div>
            </div>

            {/* Transaction list */}
            <div className="flex-1 overflow-y-auto min-h-0 -mx-6 px-6">
              <div className="flex items-center justify-between py-2 border-b border-gray-100 dark:border-gray-800 mb-1">
                <button
                  type="button"
                  onClick={toggleAll}
                  className="text-xs text-indigo-600 hover:underline"
                >
                  {checked.size === transactions.length ? "Deselect all" : "Select all"}
                </button>
                <span className="text-xs text-gray-400 dark:text-gray-500">
                  {checked.size} / {transactions.length} selected
                </span>
              </div>
              {transactions.length === 0 ? (
                <p className="text-sm text-gray-400 dark:text-gray-500 text-center py-8">
                  No transactions in this date range
                </p>
              ) : (
                <div className="divide-y divide-gray-50 dark:divide-gray-800">
                  {transactions.map((tx) => {
                    const isChecked = checked.has(tx.id);
                    return (
                      <label
                        key={tx.id}
                        className="flex items-center gap-3 py-2.5 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800 -mx-2 px-2 rounded"
                      >
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={() => {
                            setChecked((prev) => {
                              const next = new Set(prev);
                              if (next.has(tx.id)) next.delete(tx.id);
                              else next.add(tx.id);
                              return next;
                            });
                          }}
                          className="h-4 w-4 rounded border-gray-300 shrink-0"
                        />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">
                            {tx.merchant ?? tx.description}
                          </p>
                          <p className="text-xs text-gray-400 dark:text-gray-500">
                            {format(new Date(tx.date), "MMM d")}
                            {tx.category && <> · <span style={{ color: tx.category.color }}>{tx.category.name}</span></>}
                            {tx.isReconciled && <span className="ml-1 text-green-500">✓ prev. reconciled</span>}
                          </p>
                        </div>
                        <span className={`text-sm font-semibold shrink-0 ${tx.isCredit ? "text-green-600" : "text-gray-900 dark:text-gray-100"}`}>
                          {tx.isCredit ? "+" : "−"}{formatCurrency(tx.amount)}
                        </span>
                      </label>
                    );
                  })}
                </div>
              )}
            </div>

            <DialogFooter className="pt-2 border-t border-gray-100 dark:border-gray-800">
              <Button variant="outline" onClick={() => setStep("setup")}>Back</Button>
              <Button
                onClick={confirmReconcile}
                disabled={saving || checked.size === 0}
                className={balanced ? "" : "bg-amber-500 hover:bg-amber-600"}
              >
                {saving ? "Saving..." : balanced ? `Reconcile ${checked.size} transactions` : "Reconcile anyway"}
              </Button>
            </DialogFooter>
          </>
        )}

        {/* Step 3: Done */}
        {step === "done" && (
          <div className="flex flex-col items-center justify-center py-10 gap-4">
            <CheckCircle2 className="w-12 h-12 text-green-500" />
            <div className="text-center">
              <p className="text-lg font-semibold text-gray-900 dark:text-gray-100">Reconciled!</p>
              <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                {checked.size} transaction{checked.size !== 1 ? "s" : ""} marked as reconciled for {accountName}.
              </p>
            </div>
            <Button onClick={() => onOpenChange(false)}>Done</Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
