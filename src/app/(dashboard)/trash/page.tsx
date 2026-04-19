"use client";

import { useState, useEffect, useCallback } from "react";
import { format } from "date-fns";
import { Trash2, RotateCcw, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { fetchJson, formatCurrency } from "@/lib/fetcher";

interface TrashedTx {
  id: string;
  date: string;
  description: string;
  merchant: string | null;
  amount: number;
  isCredit: boolean;
  deletedAt: string;
  category: { id: string; name: string; color: string } | null;
  account: { id: string; name: string };
}

export default function TrashPage() {
  const [transactions, setTransactions] = useState<TrashedTx[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [purgeAllOpen, setPurgeAllOpen] = useState(false);
  const [purging, setPurging] = useState(false);

  const fetchTrash = useCallback(async () => {
    setLoading(true);
    try {
      const data = await fetchJson<{ transactions: TrashedTx[]; total: number }>("/api/trash?limit=100");
      setTransactions(data.transactions);
      setTotal(data.total);
    } catch {
      toast.error("Couldn't load trash");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchTrash(); }, [fetchTrash]);

  async function restore(id: string) {
    const res = await fetch(`/api/trash/${id}`, { method: "POST" });
    if (res.ok) {
      toast.success("Transaction restored");
      fetchTrash();
    } else {
      toast.error("Failed to restore");
    }
  }

  async function purgeOne(id: string) {
    const res = await fetch(`/api/trash/${id}`, { method: "DELETE" });
    if (res.ok) {
      toast.success("Permanently deleted");
      fetchTrash();
    } else {
      toast.error("Failed to delete");
    }
  }

  async function purgeAll() {
    setPurging(true);
    const res = await fetch("/api/trash", { method: "DELETE" });
    if (res.ok) {
      const data = await res.json();
      toast.success(`Purged ${data.purged} transaction${data.purged !== 1 ? "s" : ""}`);
      fetchTrash();
    } else {
      toast.error("Failed to purge");
    }
    setPurging(false);
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100 flex items-center gap-2">
            <Trash2 className="w-5 h-5 text-gray-400 dark:text-gray-500" />
            Trash
          </h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
            {total} deleted transaction{total !== 1 ? "s" : ""} · restore or permanently purge
          </p>
        </div>
        {total > 0 && (
          <Button variant="destructive" size="sm" onClick={() => setPurgeAllOpen(true)} disabled={purging}>
            <Trash2 className="w-3.5 h-3.5 mr-1.5" />
            Purge all
          </Button>
        )}
      </div>

      {loading ? (
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-14 w-full rounded-xl" />
          ))}
        </div>
      ) : transactions.length === 0 ? (
        <div className="text-center py-16 text-gray-400 dark:text-gray-500">
          <Trash2 className="w-10 h-10 mx-auto mb-3 opacity-30" />
          <p className="font-medium">Trash is empty</p>
          <p className="text-sm mt-1">Deleted transactions will appear here</p>
        </div>
      ) : (
        <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl divide-y divide-gray-50 dark:divide-gray-800 overflow-hidden">
          {transactions.map((tx) => (
            <div key={tx.id} className="flex items-center gap-3 px-4 py-3">
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">
                  {tx.merchant ?? tx.description}
                </p>
                <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">
                  {format(new Date(tx.date), "MMM d, yyyy")} · {tx.account.name}
                  {tx.category && (
                    <>
                      {" · "}
                      <span style={{ color: tx.category.color }}>{tx.category.name}</span>
                    </>
                  )}
                  {" · "}
                  <span className="text-gray-300 dark:text-gray-600">
                    Deleted {format(new Date(tx.deletedAt), "MMM d")}
                  </span>
                </p>
              </div>
              <span
                className={`text-sm font-semibold shrink-0 ${
                  tx.isCredit ? "text-green-600" : "text-gray-900 dark:text-gray-100"
                }`}
              >
                {tx.isCredit ? "+" : "−"}{formatCurrency(tx.amount)}
              </span>
              <div className="flex items-center gap-1 shrink-0">
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 text-xs text-blue-600 hover:text-blue-700"
                  onClick={() => restore(tx.id)}
                  title="Restore"
                >
                  <RotateCcw className="w-3.5 h-3.5 mr-1" />
                  Restore
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 text-xs text-red-400 hover:text-red-600"
                  onClick={() => purgeOne(tx.id)}
                  title="Permanently delete"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      <ConfirmDialog
        open={purgeAllOpen}
        onOpenChange={setPurgeAllOpen}
        title="Purge all trash?"
        description={
          <span className="flex items-start gap-2">
            <AlertTriangle className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />
            This will permanently delete all {total} transaction{total !== 1 ? "s" : ""} in the trash. This cannot be undone.
          </span>
        }
        confirmLabel="Purge all"
        destructive
        onConfirm={purgeAll}
      />
    </div>
  );
}
