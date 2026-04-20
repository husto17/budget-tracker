"use client";

import { useState, useEffect } from "react";
import { format } from "date-fns";
import { HandCoins, X, Check } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { fetchJson, FetchError, formatCurrency } from "@/lib/fetcher";
import Link from "next/link";

interface TxRef {
  id: string;
  date: string;
  merchant: string | null;
  description: string;
  amount: number;
  account: { id: string; name: string };
  category?: { name: string; color: string } | null;
}

interface SharedExpense {
  id: string;
  amount: number;
  personName: string | null;
  note: string | null;
  settled: boolean;
  settledAt: string | null;
  createdAt: string;
  originalTx: TxRef;
}

export default function SharedExpensesPage() {
  const [rows, setRows] = useState<SharedExpense[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [settling, setSettling] = useState<string | null>(null);
  const [showSettled, setShowSettled] = useState(false);

  async function load() {
    try {
      const data = await fetchJson<SharedExpense[]>("/api/reimbursements");
      setRows(data);
      setLoadError(null);
    } catch (e) {
      setLoadError(e instanceof FetchError ? e.message : "Couldn't load");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  async function handleSettle(id: string, settled: boolean) {
    setSettling(id);
    try {
      await fetchJson(`/api/reimbursements/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ settled }),
      });
      setRows((prev) => prev.map((r) => r.id === id ? { ...r, settled, settledAt: settled ? new Date().toISOString() : null } : r));
    } catch {
      toast.error("Failed to update");
    } finally {
      setSettling(null);
    }
  }

  async function handleDelete(id: string) {
    try {
      await fetchJson(`/api/reimbursements/${id}`, { method: "DELETE" });
      setRows((prev) => prev.filter((r) => r.id !== id));
      toast.success("Removed");
    } catch {
      toast.error("Failed to remove");
    }
  }

  const outstanding = rows.filter((r) => !r.settled);
  const settled = rows.filter((r) => r.settled);
  const totalOutstanding = outstanding.reduce((s, r) => s + r.amount, 0);

  return (
    <div className="space-y-6 max-w-2xl mx-auto">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100 flex items-center gap-2">
            <HandCoins className="w-5 h-5 text-indigo-500" /> Shared Expenses
          </h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
            Bills you fronted — track who owes you and mark when they pay back.
          </p>
        </div>
        {totalOutstanding > 0 && (
          <div className="text-right shrink-0">
            <p className="text-xs text-gray-400 dark:text-gray-500">Outstanding</p>
            <p className="text-xl font-bold text-amber-600 dark:text-amber-400">{formatCurrency(totalOutstanding)}</p>
          </div>
        )}
      </div>

      {loading ? (
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Card key={i}><CardContent className="p-4"><Skeleton className="h-14 w-full" /></CardContent></Card>
          ))}
        </div>
      ) : loadError ? (
        <div className="text-center py-12">
          <p className="text-sm text-red-600">{loadError}</p>
          <Button variant="outline" size="sm" className="mt-3" onClick={() => { setLoading(true); load(); }}>Try again</Button>
        </div>
      ) : rows.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <HandCoins className="w-10 h-10 mx-auto mb-3 text-gray-200 dark:text-gray-700" />
            <p className="text-sm text-gray-500 dark:text-gray-400 font-medium">No shared expenses yet</p>
            <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
              Open any expense on the{" "}
              <Link href="/transactions" className="text-indigo-600 hover:underline">transactions page</Link>
              {" "}and tap <strong>Owed to me</strong> to track what others owe you.
            </p>
          </CardContent>
        </Card>
      ) : (
        <>
          {/* Outstanding */}
          {outstanding.length > 0 && (
            <div className="space-y-3">
              {outstanding.map((r) => <ExpenseRow key={r.id} r={r} settling={settling} onSettle={handleSettle} onDelete={handleDelete} />)}
            </div>
          )}

          {outstanding.length === 0 && settled.length > 0 && (
            <div className="text-center py-6 text-sm text-emerald-600 dark:text-emerald-400 font-medium">
              ✓ All caught up — nothing outstanding
            </div>
          )}

          {/* Settled */}
          {settled.length > 0 && (
            <div>
              <button
                onClick={() => setShowSettled((v) => !v)}
                className="text-xs text-gray-400 dark:text-gray-500 hover:text-gray-700 dark:hover:text-gray-200 flex items-center gap-1 mb-3"
              >
                <Check className="w-3 h-3" />
                {showSettled ? "Hide" : "Show"} settled ({settled.length} · {formatCurrency(settled.reduce((s, r) => s + r.amount, 0))})
              </button>
              {showSettled && (
                <div className="space-y-3">
                  {settled.map((r) => <ExpenseRow key={r.id} r={r} settling={settling} onSettle={handleSettle} onDelete={handleDelete} />)}
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}

function ExpenseRow({
  r, settling, onSettle, onDelete,
}: {
  r: SharedExpense;
  settling: string | null;
  onSettle: (id: string, settled: boolean) => void;
  onDelete: (id: string) => void;
}) {
  const label = r.originalTx.merchant ?? r.originalTx.description;
  return (
    <Card className={r.settled ? "opacity-60" : ""}>
      <CardContent className="p-4">
        <div className="flex items-start gap-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <Link
                href={`/transactions?search=${encodeURIComponent(label)}`}
                className="font-medium text-gray-900 dark:text-gray-100 hover:text-indigo-600 text-sm truncate"
              >
                {label}
              </Link>
              {r.originalTx.category && (
                <span className="text-[11px] px-1.5 py-0.5 rounded-full" style={{
                  backgroundColor: r.originalTx.category.color + "22",
                  color: r.originalTx.category.color,
                }}>
                  {r.originalTx.category.name}
                </span>
              )}
            </div>
            <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">
              {format(new Date(r.originalTx.date), "d MMM yyyy")} · {r.originalTx.account.name}
              {" "}· paid {formatCurrency(r.originalTx.amount)}
            </p>
            {(r.personName || r.note) && (
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1 italic">
                {r.personName && <span className="not-italic font-medium text-gray-700 dark:text-gray-300">{r.personName}</span>}
                {r.personName && r.note ? " · " : ""}
                {r.note}
              </p>
            )}
          </div>

          <div className="text-right shrink-0">
            <p className={`text-base font-bold tabular-nums ${r.settled ? "text-emerald-600 dark:text-emerald-400" : "text-amber-600 dark:text-amber-400"}`}>
              {formatCurrency(r.amount)}
            </p>
            <p className={`text-[10px] font-semibold uppercase tracking-wide ${r.settled ? "text-emerald-500" : "text-amber-500"}`}>
              {r.settled ? "Settled" : "Outstanding"}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 mt-3 pt-3 border-t border-gray-100 dark:border-gray-800">
          <Button
            size="sm"
            variant={r.settled ? "outline" : "default"}
            className={`h-7 text-xs flex-1 ${!r.settled ? "bg-emerald-600 hover:bg-emerald-700 text-white" : ""}`}
            disabled={settling === r.id}
            onClick={() => onSettle(r.id, !r.settled)}
          >
            {settling === r.id ? "…" : r.settled ? "Mark outstanding" : "Mark settled"}
          </Button>
          <Button
            size="sm" variant="ghost"
            className="h-7 w-7 p-0 text-gray-400 hover:text-red-500"
            onClick={() => onDelete(r.id)}
            aria-label="Remove"
          >
            <X className="w-3.5 h-3.5" />
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
