import { format } from "date-fns";
import { fetchJson, FetchError } from "@/lib/fetcher";
import type { Transaction } from "./types";

export interface ExportFilters {
  accountId?: string;
  categoryId?: string;
  uncategorized?: boolean;
  search?: string;
  from?: string;
  to?: string;
  status?: string; // "all" | "pending" | "posted"
}

// Pull every filtered row via pagination (capped at 10k) and stream into a
// CSV blob the browser downloads. Lives outside page.tsx so the 2000-line
// file doesn't need to carry it.
export async function exportTransactionsCsv(filters: ExportFilters): Promise<number> {
  const params = new URLSearchParams({ limit: "500" });
  if (filters.accountId && filters.accountId !== "all") params.set("accountId", filters.accountId);
  if (filters.categoryId && filters.categoryId !== "all") params.set("categoryId", filters.categoryId);
  if (filters.uncategorized) params.set("uncategorized", "true");
  if (filters.search) params.set("search", filters.search);
  if (filters.from) params.set("from", filters.from);
  if (filters.to) params.set("to", filters.to);
  if (filters.status && filters.status !== "all") params.set("status", filters.status);

  const rows: Transaction[] = [];
  let p = 1;
  const cap = 20;
  while (p <= cap) {
    params.set("page", String(p));
    try {
      const data = await fetchJson<{ transactions: Transaction[]; total: number }>(
        `/api/transactions?${params}`,
      );
      rows.push(...data.transactions);
      if (rows.length >= data.total || data.transactions.length === 0) break;
      p++;
    } catch (e) {
      if (e instanceof FetchError) throw e;
      throw new Error("Failed to fetch transactions for export");
    }
  }

  const esc = (v: string | number | null | undefined): string => {
    if (v == null) return "";
    const s = String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const header = ["Date", "Merchant", "Amount", "Type", "Category", "Account", "Status", "Notes"];
  const csv = [
    header.join(","),
    ...rows.map((t) =>
      [
        format(new Date(t.date), "yyyy-MM-dd"),
        esc(t.merchant ?? t.description),
        t.isCredit ? t.amount : -t.amount,
        t.isCredit ? "Credit" : "Debit",
        esc(t.category?.name ?? ""),
        esc(t.account?.name ?? ""),
        t.isPending ? "Pending" : "Posted",
        esc(t.notes ?? ""),
      ].join(","),
    ),
  ].join("\n");

  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `transactions-${format(new Date(), "yyyy-MM-dd")}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
  return rows.length;
}
