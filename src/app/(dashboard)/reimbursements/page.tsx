"use client";

import { useState, useEffect } from "react";
import { format } from "date-fns";
import { ArrowRight, Unlink, Receipt } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { fetchJson, FetchError, formatCurrency } from "@/lib/fetcher";
import Link from "next/link";

interface TxRef {
  id: string;
  date: string;
  description: string;
  merchant: string | null;
  amount: number;
  account: { id: string; name: string };
  category?: { name: string; color: string } | null;
}

interface ReimbursementRow {
  id: string;
  amount: number;
  note: string | null;
  createdAt: string;
  originalTx: TxRef;
  reimbursementTx: TxRef;
}

export default function ReimbursementsPage() {
  const [rows, setRows] = useState<ReimbursementRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [unlinkTarget, setUnlinkTarget] = useState<ReimbursementRow | null>(null);

  async function load() {
    try {
      const data = await fetchJson<ReimbursementRow[]>("/api/reimbursements");
      setRows(data);
      setLoadError(null);
    } catch (e) {
      setLoadError(e instanceof FetchError ? e.message : "Couldn't load reimbursements");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  async function handleUnlink() {
    if (!unlinkTarget) return;
    try {
      await fetchJson(`/api/reimbursements/${unlinkTarget.id}`, { method: "DELETE" });
      toast.success("Reimbursement unlinked");
      load();
    } catch {
      toast.error("Failed to unlink");
      throw new Error("unlink failed");
    }
  }

  const totalReimbursed = rows.reduce((s, r) => s + r.amount, 0);

  return (
    <div className="space-y-6 max-w-3xl mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100 flex items-center gap-2">
            <Receipt className="w-5 h-5 text-indigo-500" /> Reimbursements
          </h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
            Expenses you paid and got money back for — refunds, work expenses, shared costs.
          </p>
        </div>
        {rows.length > 0 && (
          <div className="text-right">
            <p className="text-xs text-gray-400 dark:text-gray-500">Total reimbursed</p>
            <p className="text-lg font-bold text-gray-900 dark:text-gray-100">{formatCurrency(totalReimbursed)}</p>
          </div>
        )}
      </div>

      {loading ? (
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Card key={i}><CardContent className="p-5"><Skeleton className="h-16 w-full" /></CardContent></Card>
          ))}
        </div>
      ) : loadError ? (
        <div className="text-center py-12">
          <p className="text-sm text-red-600 font-medium">{loadError}</p>
          <Button variant="outline" size="sm" className="mt-3" onClick={() => { setLoading(true); load(); }}>
            Try again
          </Button>
        </div>
      ) : rows.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <Receipt className="w-10 h-10 mx-auto mb-3 text-gray-200 dark:text-gray-700" />
            <p className="text-sm text-gray-500 dark:text-gray-400 font-medium">No reimbursements yet</p>
            <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
              When you get money back for an expense, open the refund on the{" "}
              <Link href="/transactions" className="text-indigo-600 hover:underline">transactions page</Link>{" "}
              and link it to the original purchase.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {rows.map((r) => {
            const origLabel = r.originalTx.merchant ?? r.originalTx.description;
            const reimLabel = r.reimbursementTx.merchant ?? r.reimbursementTx.description;
            const fullyReimb = Math.abs(r.amount - r.originalTx.amount) < 0.01;
            const partialPct = Math.round((r.amount / r.originalTx.amount) * 100);
            return (
              <Card key={r.id} className="overflow-hidden">
                <CardContent className="p-4">
                  <div className="flex items-start gap-3">
                    <div className="flex-1 min-w-0">
                      {/* Original debit → reimbursement credit */}
                      <div className="flex items-center gap-2 text-sm flex-wrap">
                        <div className="min-w-0">
                          <Link
                            href={`/transactions?search=${encodeURIComponent(origLabel)}`}
                            className="font-medium text-gray-900 dark:text-gray-100 hover:text-blue-600 truncate block"
                          >
                            {origLabel}
                          </Link>
                          <p className="text-xs text-gray-400 dark:text-gray-500">
                            {format(new Date(r.originalTx.date), "d MMM yyyy")} · {r.originalTx.account.name}
                            {r.originalTx.category && (
                              <> · <span style={{ color: r.originalTx.category.color }}>{r.originalTx.category.name}</span></>
                            )}
                          </p>
                        </div>
                        <ArrowRight className="w-4 h-4 text-gray-300 dark:text-gray-600 shrink-0" />
                        <div className="min-w-0">
                          <Link
                            href={`/transactions?search=${encodeURIComponent(reimLabel)}`}
                            className="font-medium text-green-700 dark:text-green-400 hover:text-green-600 truncate block"
                          >
                            {reimLabel}
                          </Link>
                          <p className="text-xs text-gray-400 dark:text-gray-500">
                            {format(new Date(r.reimbursementTx.date), "d MMM yyyy")} · {r.reimbursementTx.account.name}
                          </p>
                        </div>
                      </div>

                      {/* Amounts + note */}
                      <div className="mt-2 flex items-center gap-3 flex-wrap text-xs text-gray-500 dark:text-gray-400">
                        <span>
                          Reimbursed{" "}
                          <strong className="text-gray-900 dark:text-gray-100">{formatCurrency(r.amount)}</strong>
                          {" "}of{" "}
                          <strong className="text-gray-900 dark:text-gray-100">{formatCurrency(r.originalTx.amount)}</strong>
                        </span>
                        <span className={`px-1.5 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wide ${
                          fullyReimb
                            ? "bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-300"
                            : "bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300"
                        }`}>
                          {fullyReimb ? "Fully reimbursed" : `${partialPct}% partial`}
                        </span>
                        {r.note && <span className="italic text-gray-400 dark:text-gray-500">&ldquo;{r.note}&rdquo;</span>}
                      </div>
                    </div>

                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 text-gray-400 hover:text-red-500 shrink-0"
                      title="Unlink reimbursement"
                      onClick={() => setUnlinkTarget(r)}
                    >
                      <Unlink className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <ConfirmDialog
        open={!!unlinkTarget}
        onOpenChange={(open) => { if (!open) setUnlinkTarget(null); }}
        title="Unlink reimbursement?"
        description={
          unlinkTarget
            ? <>Remove the reimbursement link between <strong>{unlinkTarget.originalTx.merchant ?? unlinkTarget.originalTx.description}</strong> and <strong>{unlinkTarget.reimbursementTx.merchant ?? unlinkTarget.reimbursementTx.description}</strong>? The transactions themselves won&apos;t be deleted.</>
            : null
        }
        confirmLabel="Unlink"
        destructive
        onConfirm={handleUnlink}
      />
    </div>
  );
}
