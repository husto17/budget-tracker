"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Download, FileJson, FileSpreadsheet } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { format } from "date-fns";

interface Tx {
  id: string;
  date: string;
  description: string;
  merchant: string | null;
  amount: number;
  isCredit: boolean;
  isPending: boolean;
  notes: string | null;
  category: { name: string } | null;
  account: { name: string };
}

async function pullAllTransactions(): Promise<Tx[]> {
  const rows: Tx[] = [];
  let p = 1;
  const cap = 50;
  while (p <= cap) {
    const res = await fetch(`/api/transactions?limit=500&page=${p}`);
    if (!res.ok) throw new Error(`Failed to fetch page ${p}`);
    const data: { transactions: Tx[]; total: number } = await res.json();
    rows.push(...data.transactions);
    if (rows.length >= data.total || data.transactions.length === 0) break;
    p++;
  }
  return rows;
}

function download(filename: string, content: string, mime: string) {
  const blob = new Blob([content], { type: `${mime};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function csvEscape(v: unknown): string {
  if (v == null) return "";
  const s = String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function DataExport() {
  const [exportingCsv, setExportingCsv] = useState(false);
  const [exportingJson, setExportingJson] = useState(false);

  async function exportCsv() {
    setExportingCsv(true);
    try {
      const rows = await pullAllTransactions();
      const header = ["Date", "Merchant", "Amount", "Type", "Category", "Account", "Status", "Notes"];
      const csv = [
        header.join(","),
        ...rows.map((t) =>
          [
            format(new Date(t.date), "yyyy-MM-dd"),
            csvEscape(t.description),
            t.isCredit ? t.amount : -t.amount,
            t.isCredit ? "Credit" : "Debit",
            csvEscape(t.category?.name ?? ""),
            csvEscape(t.account.name),
            t.isPending ? "Pending" : "Posted",
            csvEscape(t.notes ?? ""),
          ].join(","),
        ),
      ].join("\n");
      download(`budget-tracker-transactions-${format(new Date(), "yyyy-MM-dd")}.csv`, csv, "text/csv");
      toast.success(`Exported ${rows.length} transactions`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Export failed");
    } finally {
      setExportingCsv(false);
    }
  }

  async function exportJson() {
    setExportingJson(true);
    try {
      const [txs, accountsRes, categoriesRes, goalsRes] = await Promise.all([
        pullAllTransactions(),
        fetch("/api/accounts").then((r) => (r.ok ? r.json() : [])),
        fetch("/api/categories").then((r) => (r.ok ? r.json() : [])),
        fetch("/api/goals").then((r) => (r.ok ? r.json() : [])).catch(() => []),
      ]);
      const payload = {
        exportedAt: new Date().toISOString(),
        counts: {
          transactions: txs.length,
          accounts: accountsRes.length,
          categories: categoriesRes.length,
          goals: goalsRes.length,
        },
        transactions: txs,
        accounts: accountsRes,
        categories: categoriesRes,
        goals: goalsRes,
      };
      download(
        `budget-tracker-export-${format(new Date(), "yyyy-MM-dd")}.json`,
        JSON.stringify(payload, null, 2),
        "application/json",
      );
      toast.success("Export downloaded");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Export failed");
    } finally {
      setExportingJson(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <Download className="w-4 h-4" /> Data export
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm text-gray-500 dark:text-gray-400">
          Download your data for backup or analysis. Exports include every transaction across all your accounts.
        </p>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" onClick={exportCsv} disabled={exportingCsv}>
            <FileSpreadsheet className="w-3.5 h-3.5 mr-1.5" />
            {exportingCsv ? "Preparing..." : "Transactions CSV"}
          </Button>
          <Button variant="outline" size="sm" onClick={exportJson} disabled={exportingJson}>
            <FileJson className="w-3.5 h-3.5 mr-1.5" />
            {exportingJson ? "Preparing..." : "Full backup (JSON)"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
