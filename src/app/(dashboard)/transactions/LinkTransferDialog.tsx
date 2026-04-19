"use client";

import { useState, useEffect, useCallback } from "react";
import { toast } from "sonner";
import { format, addDays, subDays } from "date-fns";
import { Search } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatCurrency } from "@/lib/fetcher";
import type { Transaction } from "./types";

interface Props {
  tx: Transaction | null;
  onClose: () => void;
  onLinked: () => void;
}

export function LinkTransferDialog({ tx, onClose, onLinked }: Props) {
  const [search, setSearch] = useState("");
  const [candidates, setCandidates] = useState<Transaction[]>([]);
  const [selectedPair, setSelectedPair] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [linking, setLinking] = useState(false);

  const loadCandidates = useCallback(async (forTx: Transaction, term: string) => {
    setLoading(true);
    const txDate = new Date(forTx.date);
    const dateFrom = format(subDays(txDate, 7), "yyyy-MM-dd");
    const dateTo = format(addDays(txDate, 7), "yyyy-MM-dd");
    const params = new URLSearchParams({
      limit: "50",
      from: dateFrom,
      to: dateTo,
      ...(term ? { search: term } : {}),
    });
    try {
      const res = await fetch(`/api/transactions?${params}`);
      if (res.ok) {
        const data: { transactions: Transaction[] } = await res.json();
        setCandidates(data.transactions.filter((t) => t.id !== forTx.id));
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!tx) return;
    setSearch("");
    setSelectedPair("");
    void loadCandidates(tx, "");
  }, [tx, loadCandidates]);

  async function handleLink() {
    if (!tx || !selectedPair) return;
    setLinking(true);
    const res = await fetch(`/api/transactions/${tx.id}/transfer`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pairedTransactionId: selectedPair }),
    });
    if (res.ok) {
      toast.success("Transfer linked");
      onLinked();
      onClose();
    } else {
      toast.error("Failed to link transfer");
    }
    setLinking(false);
  }

  return (
    <Dialog open={!!tx} onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Link as Transfer</DialogTitle>
        </DialogHeader>
        {tx && (
          <div className="space-y-4">
            <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-3 text-sm">
              <p className="font-medium text-gray-900 dark:text-gray-100">
                {tx.merchant ?? tx.description}
              </p>
              <p className="text-gray-500 dark:text-gray-400 text-xs mt-0.5">
                {format(new Date(tx.date), "dd MMM yyyy")} &middot; {tx.account.name} &middot;{" "}
                {tx.isCredit ? "+" : "−"}
                {formatCurrency(tx.amount)}
              </p>
            </div>
            <p className="text-sm text-gray-600 dark:text-gray-300">
              Select the matching transaction in the other account (showing transactions within ±7 days):
            </p>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 dark:text-gray-500" />
              <Input
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  void loadCandidates(tx, e.target.value);
                }}
                placeholder="Search matching transaction..."
                className="pl-9"
              />
            </div>
            <div className="max-h-64 overflow-y-auto space-y-1 border border-gray-100 dark:border-gray-800 rounded-lg">
              {loading ? (
                <p className="text-center text-sm text-gray-400 dark:text-gray-500 py-4">Loading...</p>
              ) : candidates.length === 0 ? (
                <p className="text-center text-sm text-gray-400 dark:text-gray-500 py-4">
                  No transactions found
                </p>
              ) : (
                candidates.map((t) => (
                  <label
                    key={t.id}
                    className={`flex items-center gap-3 px-3 py-2 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800 rounded transition-colors ${
                      selectedPair === t.id ? "bg-blue-50 dark:bg-indigo-950/40" : ""
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
                      <p className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">
                        {t.merchant ?? t.description}
                      </p>
                      <p className="text-xs text-gray-400 dark:text-gray-500">
                        {format(new Date(t.date), "dd MMM yyyy")} &middot; {t.account.name}
                      </p>
                    </div>
                    <span
                      className={`text-sm font-medium shrink-0 ${
                        t.isCredit ? "text-green-600" : "text-gray-900 dark:text-gray-100"
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
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={handleLink} disabled={!selectedPair || linking}>
            {linking ? "Linking..." : "Link as Transfer"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
