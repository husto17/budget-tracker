"use client";

import { use, useEffect, useState } from "react";
import Link from "next/link";
import { format, parseISO } from "date-fns";
import { ArrowLeft, ArrowRight, Store } from "lucide-react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { MerchantLogo } from "@/components/ui/merchant-logo";
import { fetchJson, FetchError, formatCurrency } from "@/lib/fetcher";

interface Detail {
  merchant: string;
  total: number;
  count: number;
  avg: number;
  firstSeen: string | null;
  lastSeen: string | null;
  monthly: Array<{ month: string; amount: number }>;
  categories: Array<{ name: string; color: string; amount: number; count: number }>;
  accounts: Array<{ id: string; name: string; amount: number; count: number }>;
  transactions: Array<{
    id: string;
    date: string;
    description: string;
    merchant: string | null;
    amount: number;
    isCredit: boolean;
    account: { id: string; name: string };
    category: { id: string; name: string; color: string } | null;
  }>;
}

function monthLabel(key: string): string {
  const [y, m] = key.split("-");
  return format(new Date(parseInt(y), parseInt(m) - 1, 1), "MMM yy");
}

export default function MerchantPage({ params }: { params: Promise<{ name: string }> }) {
  const { name: raw } = use(params);
  const name = decodeURIComponent(raw);
  const [data, setData] = useState<Detail | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchJson<Detail>(`/api/merchants/${encodeURIComponent(name)}`)
      .then((d) => {
        if (!cancelled) setData(d);
      })
      .catch((e) => {
        if (!cancelled) setErr(e instanceof FetchError ? e.message : "Couldn't load");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [name]);

  if (loading) {
    return (
      <div className="space-y-4 max-w-4xl">
        <Skeleton className="h-8 w-60" />
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-52 w-full" />
      </div>
    );
  }

  if (err || !data) {
    return (
      <div className="text-center py-12 max-w-4xl">
        <p className="text-sm text-red-600 font-medium">{err ?? "No data"}</p>
        <Link href="/transactions" className="text-sm text-blue-600 hover:underline mt-3 inline-block">
          Back to transactions
        </Link>
      </div>
    );
  }

  if (data.count === 0) {
    return (
      <div className="space-y-4 max-w-4xl">
        <Link href="/transactions" className="text-xs text-gray-500 hover:text-gray-900 dark:hover:text-gray-100 inline-flex items-center gap-1">
          <ArrowLeft className="w-3 h-3" /> Back
        </Link>
        <div className="text-center py-12">
          <Store className="w-10 h-10 mx-auto mb-3 text-gray-200" />
          <p className="text-sm text-gray-500 dark:text-gray-400 font-medium">No transactions found for &quot;{name}&quot;</p>
        </div>
      </div>
    );
  }

  const maxMonthly = Math.max(...data.monthly.map((m) => m.amount), 1);

  return (
    <div className="space-y-6 max-w-5xl">
      <div>
        <Link
          href="/transactions"
          className="text-xs text-gray-500 hover:text-gray-900 dark:hover:text-gray-100 inline-flex items-center gap-1"
        >
          <ArrowLeft className="w-3 h-3" /> Back
        </Link>
        <div className="mt-1 flex items-center gap-3">
          <MerchantLogo merchant={data.merchant} fallbackColor={data.categories[0]?.color} size="lg" />
          <div className="min-w-0">
            <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100 truncate">{data.merchant}</h1>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
              {data.firstSeen && data.lastSeen && (
                <>
                  First seen {format(parseISO(data.firstSeen), "d MMM yyyy")} · Last{" "}
                  {format(parseISO(data.lastSeen), "d MMM yyyy")}
                </>
              )}
            </p>
          </div>
        </div>
      </div>

      {/* Summary stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card className="border-0 ring-1 ring-gray-200 dark:ring-gray-800/80">
          <CardContent className="pt-5 pb-4">
            <p className="text-[10px] uppercase tracking-wide text-gray-400 dark:text-gray-500">Total spent</p>
            <p className="text-xl font-bold mt-0.5 tabular-nums">{formatCurrency(data.total)}</p>
          </CardContent>
        </Card>
        <Card className="border-0 ring-1 ring-gray-200 dark:ring-gray-800/80">
          <CardContent className="pt-5 pb-4">
            <p className="text-[10px] uppercase tracking-wide text-gray-400 dark:text-gray-500">Visits</p>
            <p className="text-xl font-bold mt-0.5 tabular-nums">{data.count}</p>
          </CardContent>
        </Card>
        <Card className="border-0 ring-1 ring-gray-200 dark:ring-gray-800/80">
          <CardContent className="pt-5 pb-4">
            <p className="text-[10px] uppercase tracking-wide text-gray-400 dark:text-gray-500">Avg per visit</p>
            <p className="text-xl font-bold mt-0.5 tabular-nums">{formatCurrency(data.avg)}</p>
          </CardContent>
        </Card>
        <Card className="border-0 ring-1 ring-gray-200 dark:ring-gray-800/80">
          <CardContent className="pt-5 pb-4">
            <p className="text-[10px] uppercase tracking-wide text-gray-400 dark:text-gray-500">Months active</p>
            <p className="text-xl font-bold mt-0.5 tabular-nums">{data.monthly.length}</p>
          </CardContent>
        </Card>
      </div>

      {/* Monthly bar */}
      {data.monthly.length > 1 && (
        <Card className="border-0 ring-1 ring-gray-200 dark:ring-gray-800/80">
          <CardHeader>
            <CardTitle className="text-base">Spending over time</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-48">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={data.monthly.map((m) => ({ ...m, label: monthLabel(m.month) }))}>
                  <XAxis dataKey="label" tick={{ fontSize: 10, fill: "#9ca3af" }} axisLine={false} tickLine={false} />
                  <YAxis
                    tick={{ fontSize: 10, fill: "#9ca3af" }}
                    axisLine={false}
                    tickLine={false}
                    tickFormatter={(v) => formatCurrency(Number(v))}
                    width={60}
                  />
                  <Tooltip
                    contentStyle={{ background: "rgba(15,23,42,0.9)", border: "none", borderRadius: 6, fontSize: 11, color: "#fff" }}
                    formatter={(v) => [formatCurrency(Number(v)), data.merchant]}
                  />
                  <Bar dataKey="amount" radius={[4, 4, 0, 0]}>
                    {data.monthly.map((m, i) => (
                      <Cell
                        key={i}
                        fill={
                          m.amount === maxMonthly
                            ? "#f43f5e"
                            : data.categories[0]?.color ?? "#6366f1"
                        }
                      />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Category / account mix */}
      <div className="grid md:grid-cols-2 gap-4">
        <Card className="border-0 ring-1 ring-gray-200 dark:ring-gray-800/80">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">By category</CardTitle>
          </CardHeader>
          <CardContent>
            {data.categories.length === 0 ? (
              <p className="text-sm text-gray-400 dark:text-gray-500">No categorised spending</p>
            ) : (
              <div className="space-y-2">
                {data.categories.map((c) => {
                  const pct = data.total > 0 ? (c.amount / data.total) * 100 : 0;
                  return (
                    <Link
                      key={c.name}
                      href={`/transactions?categoryName=${encodeURIComponent(c.name)}&search=${encodeURIComponent(data.merchant)}`}
                      className="block"
                    >
                      <div className="flex items-center justify-between text-sm">
                        <span className="flex items-center gap-2 min-w-0">
                          <span className="w-2 h-2 rounded-full shrink-0" style={{ background: c.color }} />
                          <span className="truncate">{c.name}</span>
                          <span className="text-xs text-gray-400 dark:text-gray-500 shrink-0">({c.count})</span>
                        </span>
                        <span className="font-semibold tabular-nums">{formatCurrency(c.amount)}</span>
                      </div>
                      <div className="mt-1 h-1 bg-gray-100 dark:bg-gray-800 rounded-full overflow-hidden">
                        <div className="h-full rounded-full" style={{ width: `${pct}%`, background: c.color }} />
                      </div>
                    </Link>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
        <Card className="border-0 ring-1 ring-gray-200 dark:ring-gray-800/80">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">By account</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {data.accounts.map((a) => (
                <Link
                  key={a.id}
                  href={`/transactions?accountId=${a.id}&search=${encodeURIComponent(data.merchant)}`}
                  className="flex items-center justify-between py-1 text-sm hover:bg-gray-50 dark:hover:bg-gray-800/40 px-2 -mx-2 rounded"
                >
                  <span className="min-w-0 flex items-center gap-2">
                    <span className="truncate">{a.name}</span>
                    <span className="text-xs text-gray-400 dark:text-gray-500 shrink-0">({a.count})</span>
                  </span>
                  <span className="font-semibold tabular-nums">{formatCurrency(a.amount)}</span>
                </Link>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Transaction list */}
      <Card className="border-0 ring-1 ring-gray-200 dark:ring-gray-800/80">
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Recent transactions</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="divide-y divide-gray-50 dark:divide-gray-800">
            {data.transactions.map((t) => (
              <Link
                key={t.id}
                href={`/transactions?search=${encodeURIComponent(t.description)}`}
                className="px-4 py-2.5 flex items-center gap-3 hover:bg-gray-50 dark:hover:bg-gray-800/40"
              >
                <span className="text-xs text-gray-400 dark:text-gray-500 w-20 tabular-nums shrink-0">
                  {format(new Date(t.date), "d MMM yy")}
                </span>
                <span className="flex-1 text-sm truncate">{t.description}</span>
                <span className="text-xs text-gray-400 dark:text-gray-500 hidden sm:block truncate">
                  {t.account.name}
                </span>
                <span className={`text-sm font-semibold tabular-nums w-24 text-right shrink-0 ${t.isCredit ? "text-emerald-600 dark:text-emerald-400" : "text-gray-900 dark:text-gray-100"}`}>
                  {t.isCredit ? "+" : "−"}{formatCurrency(t.amount)}
                </span>
                <ArrowRight className="w-3 h-3 text-gray-300 dark:text-gray-600 shrink-0 hidden sm:block" />
              </Link>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
