"use client";

import { useEffect, useState } from "react";
import { format } from "date-fns";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  LineChart, Line, Legend, Cell, ReferenceLine
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { AlertTriangle, Repeat, TrendingUp, TrendingDown, ExternalLink, ArrowRight } from "lucide-react";
import Link from "next/link";
import { fetchJson, FetchError, formatCurrency, formatAxisCurrency } from "@/lib/fetcher";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { PALETTE as CAT_COLORS } from "@/lib/palette";

interface InsightData {
  monthlyByCategory: Record<string, Record<string, number>>;
  monthlyTotals: Record<string, number>;
  thisMonthTotal: number;
  lastMonthTotal: number;
  momChange: number;
  topCategories: [string, number][];
  categorySpendingPrevMonth: Record<string, number>;
  categoryColors: Record<string, string>;
  dayOfWeekSpending: Array<{ dayName: string; amount: number; count: number; avg: number }>;
  categoryBudgetHistory: Array<{
    category: string;
    color: string;
    budget: number;
    history: Array<{ month: string; spent: number; budget: number }>;
  }>;
  merchantLoyalty: Array<{
    merchant: string;
    visitCount: number;
    avgDaysBetween: number;
    trend: "increasing" | "decreasing" | "stable";
    lastVisit: string;
    totalSpent: number;
  }>;
  paydayPattern: {
    detectedPaydays: number[];
    spendingByDayOfMonth: Array<{ day: number; amount: number; count: number }>;
  } | null;
  txSizeDistribution: Array<{ label: string; count: number; amount: number }>;
  surpriseExpenses: Array<{
    merchant: string;
    amount: number;
    date: string;
    categoryName: string | null;
    categoryAvg: number;
  }>;
  hygiene: {
    totalTxCount: number;
    categorizedCount: number;
    categorizedPct: number;
    totalAmount: number;
    categorizedAmount: number;
    categorizedAmountPct: number;
    score: number;
  };
  billTimingRisk: Array<{
    merchant: string;
    amount: number;
    nextExpectedDate: string;
    daysUntilNext: number;
    riskReason: string;
  }>;
  recurring: Array<{ name: string; amount: number; months: number }>;
  anomalies: Array<{ category: string; thisMonth: number; average: number; ratio: number }>;
  incomeVsSpending: Array<{ month: string; income: number; spending: number; net: number }>;
  subscriptions: Array<{
    merchant: string;
    amount: number;
    cadence: "weekly" | "biweekly" | "monthly" | "quarterly" | "annual" | null;
    type: "subscription" | "bill";
    monthlyEquivalent: number;
    categoryId: string | null;
    categoryName: string | null;
    lastDate: string;
    nextExpectedDate: string;
    daysUntilNext: number;
    monthlyCount: number;
  }>;
}

interface AccountLite {
  id: string;
  name: string;
}

function formatMonth(key: string) {
  const [year, month] = key.split("-");
  return format(new Date(parseInt(year), parseInt(month) - 1, 1), "MMM yy");
}

type RangeMonths = 3 | 6 | 12 | "custom";

export default function InsightsPage() {
  const [insights, setInsights] = useState<InsightData | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [accounts, setAccounts] = useState<AccountLite[]>([]);
  const [accountId, setAccountId] = useState<string>("all");
  const [range, setRange] = useState<RangeMonths>(() => {
    if (typeof window === "undefined") return 6;
    try {
      const saved = parseInt(localStorage.getItem("insights:range") ?? "", 10);
      if (saved === 3 || saved === 6 || saved === 12) return saved;
    } catch {}
    return 6;
  });
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");
  const [reloadKey, setReloadKey] = useState(0);
  const [dismissed, setDismissed] = useState<Set<string>>(() => {
    if (typeof window === "undefined") return new Set();
    try {
      const saved = JSON.parse(localStorage.getItem("insights:dismissed-recurring") ?? "[]");
      return new Set(Array.isArray(saved) ? saved : []);
    } catch { return new Set(); }
  });

  function dismissMerchant(merchant: string) {
    setDismissed((prev) => {
      const next = new Set(prev);
      next.add(merchant);
      try { localStorage.setItem("insights:dismissed-recurring", JSON.stringify(Array.from(next))); } catch {}
      return next;
    });
  }
  function restoreAll() {
    setDismissed(new Set());
    try { localStorage.removeItem("insights:dismissed-recurring"); } catch {}
  }

  function setRangePersisted(next: RangeMonths) {
    setRange(next);
    if (next !== "custom") {
      try { localStorage.setItem("insights:range", String(next)); } catch {}
    }
  }

  useEffect(() => {
    fetchJson<AccountLite[]>("/api/accounts")
      .then(setAccounts)
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (range === "custom" && (!customFrom || !customTo)) return;
    let cancelled = false;
    setLoading(true);
    const params = new URLSearchParams();
    if (range === "custom") {
      params.set("from", customFrom);
      params.set("to", customTo);
    } else {
      params.set("months", String(range));
    }
    if (accountId !== "all") params.set("accountId", accountId);
    fetchJson<InsightData>(`/api/insights?${params}`)
      .then((data) => {
        if (cancelled) return;
        setInsights(data);
        setLoadError(null);
      })
      .catch((e) => {
        if (cancelled) return;
        setLoadError(e instanceof FetchError ? e.message : "Couldn't load insights");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [reloadKey, range, accountId, customFrom, customTo]);

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="space-y-2">
          <Skeleton className="h-7 w-28" />
          <Skeleton className="h-4 w-64" />
        </div>
        <Card><CardContent className="p-6"><Skeleton className="h-64 w-full" /></CardContent></Card>
        <Card><CardContent className="p-6"><Skeleton className="h-52 w-full" /></CardContent></Card>
        <Card><CardContent className="p-6"><Skeleton className="h-40 w-full" /></CardContent></Card>
      </div>
    );
  }
  if (loadError) {
    return (
      <div className="text-center py-12">
        <p className="text-sm text-red-600 font-medium">{loadError}</p>
        <Button
          variant="outline"
          size="sm"
          className="mt-3"
          onClick={() => {
            setLoading(true);
            setLoadError(null);
            setReloadKey((k) => k + 1);
          }}
        >
          Try again
        </Button>
      </div>
    );
  }
  if (!insights) return null;

  // Build stacked bar data for spending by category by month
  const allCategories = new Set<string>();
  Object.values(insights.monthlyByCategory).forEach((cats) =>
    Object.keys(cats).forEach((c) => allCategories.add(c))
  );
  const TOP_N = 8;
  const catList = Array.from(allCategories).slice(0, TOP_N);
  const hasOther = allCategories.size > TOP_N;

  const rangeSlice = range === "custom" ? undefined : -range;
  const stackedData = Object.entries(insights.monthlyByCategory)
    .sort(([a], [b]) => a.localeCompare(b))
    .slice(rangeSlice)
    .map(([month, cats]) => {
      const topTotal = catList.reduce((s, c) => s + (cats[c] ?? 0), 0);
      const monthTotal = Object.values(cats).reduce((s, v) => s + v, 0);
      const other = monthTotal - topTotal;
      return {
        month: formatMonth(month),
        ...Object.fromEntries(catList.map((c) => [c, cats[c] ?? 0])),
        ...(hasOther && other > 0.01 ? { Other: other } : {}),
      };
    });

  const incomeData = insights.incomeVsSpending.slice(rangeSlice).map((d) => ({
    ...d,
    month: formatMonth(d.month),
  }));

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Insights</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">Patterns, anomalies, and trends in your spending</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {accounts.length > 1 && (
            <select
              value={accountId}
              onChange={(e) => setAccountId(e.target.value)}
              className="text-xs h-8 px-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-700 dark:text-gray-200"
            >
              <option value="all">All accounts</option>
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>{a.name}</option>
              ))}
            </select>
          )}
          <div className="flex items-center gap-1 bg-gray-100 dark:bg-gray-800 rounded-lg p-1">
            {([3, 6, 12] as const).map((r) => (
              <button
                key={r}
                type="button"
                onClick={() => setRangePersisted(r)}
                className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${
                  range === r
                    ? "bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 shadow-sm"
                    : "text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100"
                }`}
              >
                {r}m
              </button>
            ))}
            <button
              type="button"
              onClick={() => setRangePersisted("custom")}
              className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${
                range === "custom"
                  ? "bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 shadow-sm"
                  : "text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100"
              }`}
            >
              Custom
            </button>
          </div>
          {range === "custom" && (
            <div className="flex items-center gap-2 flex-wrap">
              <input
                type="date"
                value={customFrom}
                onChange={(e) => setCustomFrom(e.target.value)}
                className="text-xs h-8 px-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-700 dark:text-gray-200"
              />
              <span className="text-xs text-gray-400 dark:text-gray-500">to</span>
              <input
                type="date"
                value={customTo}
                onChange={(e) => setCustomTo(e.target.value)}
                className="text-xs h-8 px-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-700 dark:text-gray-200"
              />
            </div>
          )}
        </div>
      </div>

      {/* Anomalies */}
      {insights.anomalies.length > 0 && (
        <Card className="border-amber-200 bg-amber-50">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2 text-amber-800">
              <AlertTriangle className="w-4 h-4" />
              Spending Anomalies This Month
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {insights.anomalies.map((a) => (
              <Link
                key={a.category}
                href={`/transactions?categoryName=${encodeURIComponent(a.category)}`}
                className="flex items-center justify-between bg-white dark:bg-gray-900 rounded-lg p-3 border border-amber-100 hover:bg-amber-50 transition-colors"
              >
                <div>
                  <p className="font-medium text-gray-900 dark:text-gray-100 flex items-center gap-1.5">
                    {a.category}
                    <ExternalLink className="w-3 h-3 text-gray-400 dark:text-gray-500" />
                  </p>
                  <p className="text-xs text-gray-500 dark:text-gray-400">Average: {formatCurrency(a.average)}/month</p>
                </div>
                <div className="text-right">
                  <p className="font-bold text-amber-700">{formatCurrency(a.thisMonth)}</p>
                  <Badge variant="destructive" className="text-xs">{a.ratio.toFixed(1)}× usual</Badge>
                </div>
              </Link>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Surprise Expenses — near anomalies since both are alerts */}
      {insights.surpriseExpenses && insights.surpriseExpenses.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-orange-500" />
              Surprise Expenses (last 90 days)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xs text-gray-400 dark:text-gray-500 mb-3">One-off charges more than 2× your usual category average — not part of a recurring pattern.</p>
            <div className="space-y-2">
              {insights.surpriseExpenses.map((e) => (
                <Link
                  key={`${e.merchant}-${e.date}`}
                  href={`/transactions?search=${encodeURIComponent(e.merchant)}`}
                  className="flex items-center justify-between py-2 px-3 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 border border-gray-100 dark:border-gray-800 transition-colors"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">{e.merchant}</p>
                    <p className="text-xs text-gray-400 dark:text-gray-500">{e.categoryName ?? "Uncategorized"} · avg {formatCurrency(e.categoryAvg)}/mo</p>
                  </div>
                  <div className="text-right shrink-0 ml-4">
                    <p className="font-semibold text-orange-600">{formatCurrency(e.amount)}</p>
                    <p className="text-xs text-gray-400 dark:text-gray-500">{e.date}</p>
                  </div>
                </Link>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Spending by category stacked bars */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <TrendingUp className="w-4 h-4" />
            Spending by Category ({range === "custom" ? "custom range" : `${range} months`})
          </CardTitle>
        </CardHeader>
        <CardContent>
          {stackedData.length === 0 ? (
            <p className="text-sm text-gray-400 dark:text-gray-500 py-8 text-center">No data yet</p>
          ) : (
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={stackedData}>
                <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => formatAxisCurrency(Number(v))} />
                <Tooltip formatter={(v) => formatCurrency(Number(v ?? 0))} />
                <Legend />
                {catList.map((cat, i) => (
                  <Bar key={cat} dataKey={cat} stackId="a"
                    fill={insights.categoryColors?.[cat] ?? CAT_COLORS[i % CAT_COLORS.length]} />
                ))}
                {hasOther && <Bar key="Other" dataKey="Other" stackId="a" fill="#9ca3af" name="Other" />}
              </BarChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>

      {/* Income vs spending */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Income vs Spending</CardTitle>
        </CardHeader>
        <CardContent>
          {incomeData.length === 0 ? (
            <p className="text-sm text-gray-400 dark:text-gray-500 py-8 text-center">No data yet</p>
          ) : (
            <ResponsiveContainer width="100%" height={240}>
              <LineChart data={incomeData}>
                <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => formatAxisCurrency(Number(v))} />
                <Tooltip formatter={(v) => formatCurrency(Number(v ?? 0))} />
                <Legend />
                <Line type="monotone" dataKey="income" stroke="#22C55E" strokeWidth={2} dot name="Income" />
                <Line type="monotone" dataKey="spending" stroke="#EF4444" strokeWidth={2} dot name="Spending" />
              </LineChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>

      {/* Savings rate — derived from income vs spending, keep adjacent */}
      {(() => {
        const rateData = insights.incomeVsSpending
          .slice(rangeSlice)
          .filter((d) => d.income > 0)
          .map((d) => ({
            month: formatMonth(d.month),
            rate: Math.round(((d.income - d.spending) / d.income) * 100),
          }));
        if (rateData.length < 2) return null;
        return (
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <TrendingUp className="w-4 h-4" />
                Savings Rate
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={200}>
                <LineChart data={rateData}>
                  <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `${v}%`} domain={["auto", "auto"]} />
                  <Tooltip formatter={(v) => [`${v}%`, "Savings rate"]} />
                  <Line type="monotone" dataKey="rate" stroke="#6366f1" strokeWidth={2} dot name="Savings rate %" />
                </LineChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        );
      })()}

      {/* Year-over-year — big-picture trend, near income charts */}
      {(() => {
        const byYear: Record<number, Record<number, number>> = {};
        Object.entries(insights.monthlyTotals).forEach(([key, total]) => {
          const [y, m] = key.split("-").map(Number);
          if (!byYear[y]) byYear[y] = {};
          byYear[y][m] = total;
        });
        const years = Object.keys(byYear).map(Number).sort();
        if (years.length < 2) return null;
        const [prevYear, thisYear] = years.slice(-2);
        const yoyData = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]
          .filter((m) => byYear[thisYear]?.[m] != null || byYear[prevYear]?.[m] != null)
          .map((m) => ({
            month: format(new Date(thisYear, m - 1, 1), "MMM"),
            [String(thisYear)]: byYear[thisYear]?.[m] ?? 0,
            [String(prevYear)]: byYear[prevYear]?.[m] ?? 0,
          }));
        if (yoyData.length === 0) return null;
        return (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Year-over-Year: {prevYear} vs {thisYear}</CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={240}>
                <BarChart data={yoyData}>
                  <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => formatAxisCurrency(Number(v))} />
                  <Tooltip formatter={(v) => formatCurrency(Number(v ?? 0))} />
                  <Legend />
                  <Bar dataKey={String(prevYear)} fill="#d1d5db" radius={[3, 3, 0, 0]} />
                  <Bar dataKey={String(thisYear)} fill="#6366f1" radius={[3, 3, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        );
      })()}

      {/* Top categories this month */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Top Spending Categories This Month</CardTitle>
        </CardHeader>
        <CardContent>
          {insights.topCategories.length === 0 ? (
            <p className="text-sm text-gray-400 dark:text-gray-500">No data this month</p>
          ) : (
            <div className="space-y-3">
              {insights.topCategories.map(([cat, amount], i) => {
                const maxAmount = insights.topCategories[0]?.[1] ?? 1;
                const pct = maxAmount > 0 ? (amount / maxAmount) * 100 : 0;
                return (
                  <Link
                    key={cat}
                    href={`/transactions?categoryName=${encodeURIComponent(cat)}`}
                    className="flex items-center gap-3 hover:bg-gray-50 dark:hover:bg-gray-800 rounded-lg px-1 -mx-1 transition-colors"
                  >
                    <span className="w-5 text-xs text-gray-400 dark:text-gray-500 font-medium text-right shrink-0">{i + 1}</span>
                    <div className="flex-1 min-w-0 h-2 bg-gray-100 dark:bg-gray-800 rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all"
                        style={{
                          width: `${pct}%`,
                          backgroundColor: insights.categoryColors?.[cat] ?? CAT_COLORS[i % CAT_COLORS.length],
                        }}
                      />
                    </div>
                    <span className="text-sm font-medium w-28 text-right shrink-0">{formatCurrency(amount)}</span>
                    <span className="text-sm text-blue-600 hover:underline w-28 truncate shrink-0">{cat}</span>
                  </Link>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Category trends: MoM % change */}
      {(() => {
        const now = new Date();
        const thisMonthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
        const thisMonthCats = insights.monthlyByCategory[thisMonthKey] ?? {};
        const prevCats = insights.categorySpendingPrevMonth ?? {};
        const allCats = Array.from(new Set([...Object.keys(thisMonthCats), ...Object.keys(prevCats)]));
        const rows = allCats
          .map((cat) => {
            const cur = thisMonthCats[cat] ?? 0;
            const prev = prevCats[cat] ?? 0;
            const change = prev > 0 ? ((cur - prev) / prev) * 100 : null;
            return { cat, cur, prev, change };
          })
          .filter((r) => r.cur > 0 || r.prev > 0)
          .sort((a, b) => (b.cur || 0) - (a.cur || 0))
          .slice(0, 10);

        if (rows.length === 0) return null;
        return (
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <ArrowRight className="w-4 h-4" />
                Category Trends: Month-over-Month
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-1">
                <div className="grid grid-cols-[1fr_auto_auto_auto] gap-x-4 text-xs text-gray-400 dark:text-gray-500 uppercase tracking-wide pb-2 border-b border-gray-100 dark:border-gray-800">
                  <span>Category</span>
                  <span className="text-right">Last month</span>
                  <span className="text-right">This month</span>
                  <span className="text-right">Change</span>
                </div>
                {rows.map(({ cat, cur, prev, change }) => (
                  <Link
                    key={cat}
                    href={`/transactions?categoryName=${encodeURIComponent(cat)}`}
                    className="grid grid-cols-[1fr_auto_auto_auto] gap-x-4 py-2.5 items-center text-sm hover:bg-gray-50 dark:hover:bg-gray-800 rounded-lg px-1 -mx-1 transition-colors"
                  >
                    <span className="font-medium text-gray-900 dark:text-gray-100 truncate">{cat}</span>
                    <span className="text-right text-gray-400 dark:text-gray-500">{prev > 0 ? formatCurrency(prev) : "—"}</span>
                    <span className="text-right font-medium">{cur > 0 ? formatCurrency(cur) : "—"}</span>
                    <span className={`text-right text-xs font-semibold flex items-center justify-end gap-0.5 ${
                      change === null ? "text-gray-400 dark:text-gray-500" :
                      change > 0 ? "text-red-500" : "text-green-600"
                    }`}>
                      {change === null ? "New" : (
                        <>
                          {change > 0
                            ? <TrendingUp className="w-3 h-3" />
                            : <TrendingDown className="w-3 h-3" />}
                          {Math.abs(change).toFixed(0)}%
                        </>
                      )}
                    </span>
                  </Link>
                ))}
              </div>
            </CardContent>
          </Card>
        );
      })()}

      {/* Category budget efficiency */}
      {insights.categoryBudgetHistory && insights.categoryBudgetHistory.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Budget vs Actual (per category)</CardTitle>
          </CardHeader>
          <CardContent className="space-y-5">
            {insights.categoryBudgetHistory.map((cat) => {
              const lastN = cat.history.slice(-6);
              return (
                <div key={cat.category}>
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-sm font-medium text-gray-800 dark:text-gray-200 flex items-center gap-1.5">
                      <span
                        className="inline-block w-2.5 h-2.5 rounded-full"
                        style={{ backgroundColor: cat.color }}
                      />
                      {cat.category}
                    </span>
                    <span className="text-xs text-gray-400 dark:text-gray-500">Budget: {formatCurrency(cat.budget)}/mo</span>
                  </div>
                  <div className="flex gap-1 items-end h-14">
                    {lastN.map((h) => {
                      const pct = Math.min((h.spent / h.budget) * 100, 120);
                      const over = h.spent > h.budget;
                      return (
                        <div key={h.month} className="flex-1 flex flex-col items-center gap-0.5">
                          <div className="w-full flex flex-col justify-end" style={{ height: 44 }}>
                            <div
                              title={`${formatMonth(h.month)}: ${formatCurrency(h.spent)} / ${formatCurrency(h.budget)}`}
                              className={`w-full rounded-sm ${over ? "bg-red-400" : "bg-indigo-400"}`}
                              style={{ height: `${Math.max(pct, 4)}%` }}
                            />
                          </div>
                          <span className="text-[9px] text-gray-400 dark:text-gray-500">{formatMonth(h.month)}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </CardContent>
        </Card>
      )}

      {/* Subscriptions & Recurring Bills — split by type */}
      {(() => {
        const all = (insights.subscriptions ?? []).filter((s) => !dismissed.has(s.merchant));
        const subs = all.filter((s) => s.type === "subscription");
        const bills = all.filter((s) => s.type === "bill");

        function RecurringRow({ sub }: { sub: typeof all[0] }) {
          const upcoming = sub.daysUntilNext >= 0 && sub.daysUntilNext <= 7;
          const overdue = sub.daysUntilNext < 0 && sub.daysUntilNext > -14;
          return (
            <div className="grid grid-cols-[1fr_auto_auto_auto_auto] gap-x-3 py-2.5 items-center text-sm">
              <div className="min-w-0">
                <Link
                  href={`/transactions?search=${encodeURIComponent(sub.merchant)}`}
                  className="font-medium text-gray-900 dark:text-gray-100 hover:text-blue-600 flex items-center gap-1 group truncate"
                >
                  {sub.merchant}
                  <ExternalLink className="w-3 h-3 text-gray-300 dark:text-gray-600 group-hover:text-blue-400 shrink-0" />
                </Link>
                <p className="text-xs text-gray-400 dark:text-gray-500">
                  {formatCurrency(sub.amount)} · {sub.categoryName ?? "Uncategorized"}
                </p>
              </div>
              <span className="text-right text-xs text-gray-500 dark:text-gray-400 capitalize whitespace-nowrap">
                {sub.cadence ?? "—"}
              </span>
              <span className={`text-right text-xs whitespace-nowrap font-medium ${
                upcoming ? "text-amber-600" : overdue ? "text-red-500" : "text-gray-400 dark:text-gray-500"
              }`}>
                {upcoming
                  ? sub.daysUntilNext === 0 ? "Today" : `In ${sub.daysUntilNext}d`
                  : overdue
                  ? `${Math.abs(sub.daysUntilNext)}d ago`
                  : format(new Date(sub.nextExpectedDate), "MMM d")}
              </span>
              <span className="text-right font-semibold text-gray-700 dark:text-gray-200 whitespace-nowrap">
                {formatCurrency(sub.monthlyEquivalent)}<span className="font-normal text-gray-400 dark:text-gray-500">/mo</span>
              </span>
              <button
                onClick={() => dismissMerchant(sub.merchant)}
                title="Remove from this list"
                className="text-gray-300 dark:text-gray-600 hover:text-red-400 transition-colors"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          );
        }

        const totalMonthly = all.reduce((s, sub) => s + sub.monthlyEquivalent, 0);

        if (!insights.subscriptions || insights.subscriptions.length === 0) {
          return (
            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2"><Repeat className="w-4 h-4" />Subscriptions &amp; Recurring</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-gray-400 dark:text-gray-500">Upload several months of statements to detect recurring patterns.</p>
              </CardContent>
            </Card>
          );
        }

        return (
          <div className="space-y-4">
            {subs.length > 0 && (
              <Card>
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-base flex items-center gap-2">
                      <Repeat className="w-4 h-4" /> Subscriptions
                      <span className="text-xs font-normal text-gray-400 dark:text-gray-500">fixed price</span>
                    </CardTitle>
                    <span className="text-sm font-semibold text-gray-700 dark:text-gray-200">
                      {formatCurrency(subs.reduce((s, sub) => s + sub.monthlyEquivalent, 0))}/mo
                    </span>
                  </div>
                </CardHeader>
                <CardContent className="pt-0">
                  <div className="divide-y divide-gray-50 dark:divide-gray-800">
                    {subs.map((sub) => <RecurringRow key={sub.merchant} sub={sub} />)}
                  </div>
                </CardContent>
              </Card>
            )}

            {bills.length > 0 && (
              <Card>
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-base flex items-center gap-2">
                      <Repeat className="w-4 h-4" /> Recurring Bills
                      <span className="text-xs font-normal text-gray-400 dark:text-gray-500">variable amount</span>
                    </CardTitle>
                    <span className="text-sm font-semibold text-gray-700 dark:text-gray-200">
                      {formatCurrency(bills.reduce((s, sub) => s + sub.monthlyEquivalent, 0))}/mo
                    </span>
                  </div>
                </CardHeader>
                <CardContent className="pt-0">
                  <div className="divide-y divide-gray-50 dark:divide-gray-800">
                    {bills.map((sub) => <RecurringRow key={sub.merchant} sub={sub} />)}
                  </div>
                </CardContent>
              </Card>
            )}

            {totalMonthly > 0 && (
              <div className="flex items-center justify-between text-sm px-1">
                <span className="text-gray-500 dark:text-gray-400">Total recurring · <span className="font-semibold text-gray-900 dark:text-gray-100">{formatCurrency(totalMonthly)}/mo</span> · {formatCurrency(totalMonthly * 12)}/yr</span>
                {dismissed.size > 0 && (
                  <button onClick={restoreAll} className="text-xs text-indigo-600 dark:text-indigo-400 hover:underline">
                    Restore {dismissed.size} hidden
                  </button>
                )}
              </div>
            )}
          </div>
        );
      })()}

      {/* Bill timing risk */}
      {insights.billTimingRisk && insights.billTimingRisk.length > 0 && (
        <Card className="border-amber-200 bg-amber-50 dark:bg-amber-950/20 dark:border-amber-800">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2 text-amber-800 dark:text-amber-300">
              <AlertTriangle className="w-4 h-4" />
              Bill Timing Risk
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {insights.billTimingRisk.map((b) => (
              <div key={b.merchant} className="flex items-start justify-between bg-white dark:bg-gray-900 rounded-lg p-3 border border-amber-100 dark:border-amber-800">
                <div>
                  <p className="font-medium text-sm text-gray-900 dark:text-gray-100">{b.merchant}</p>
                  <p className="text-xs text-amber-700 dark:text-amber-400 mt-0.5">{b.riskReason}</p>
                </div>
                <div className="text-right shrink-0 ml-4">
                  <p className="font-semibold text-sm">{formatCurrency(b.amount)}</p>
                  <p className="text-xs text-gray-400 dark:text-gray-500">in {b.daysUntilNext}d</p>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Merchant loyalty */}
      {insights.merchantLoyalty && insights.merchantLoyalty.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Merchant Loyalty</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xs text-gray-400 dark:text-gray-500 mb-3">Merchants you visit regularly — sorted by frequency. Trend shows if you&apos;re going more or less often.</p>
            <div className="space-y-1">
              <div className="grid grid-cols-[1fr_auto_auto_auto] gap-x-4 text-xs text-gray-400 dark:text-gray-500 uppercase tracking-wide pb-2 border-b border-gray-100 dark:border-gray-800">
                <span>Merchant</span>
                <span className="text-right">Visits</span>
                <span className="text-right">Avg every</span>
                <span className="text-right">Trend</span>
              </div>
              {insights.merchantLoyalty.map((m) => (
                <Link
                  key={m.merchant}
                  href={`/transactions?search=${encodeURIComponent(m.merchant)}`}
                  className="grid grid-cols-[1fr_auto_auto_auto] gap-x-4 py-2.5 items-center text-sm hover:bg-gray-50 dark:hover:bg-gray-800 rounded-lg px-1 -mx-1 transition-colors"
                >
                  <div className="min-w-0">
                    <p className="font-medium text-gray-900 dark:text-gray-100 truncate">{m.merchant}</p>
                    <p className="text-xs text-gray-400 dark:text-gray-500">{formatCurrency(m.totalSpent)} total · last {m.lastVisit}</p>
                  </div>
                  <span className="text-right text-gray-500 dark:text-gray-400">{m.visitCount}×</span>
                  <span className="text-right text-gray-500 dark:text-gray-400 whitespace-nowrap">{m.avgDaysBetween}d</span>
                  <span className={`text-right text-xs font-semibold whitespace-nowrap ${
                    m.trend === "increasing" ? "text-green-600" :
                    m.trend === "decreasing" ? "text-red-500" :
                    "text-gray-400 dark:text-gray-500"
                  }`}>
                    {m.trend === "increasing" ? "↑ more often" : m.trend === "decreasing" ? "↓ less often" : "→ stable"}
                  </span>
                </Link>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Spending by day of week */}
      {insights.dayOfWeekSpending && insights.dayOfWeekSpending.some((d) => d.count > 0) && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Spending by Day of Week</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xs text-gray-400 dark:text-gray-500 mb-3">Average transaction size per day — helps spot behavioral patterns.</p>
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={insights.dayOfWeekSpending}>
                <XAxis dataKey="dayName" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => formatAxisCurrency(Number(v))} />
                <Tooltip
                  formatter={(v, name) => [formatCurrency(Number(v)), name === "avg" ? "Avg per tx" : "Total spent"]}
                />
                <Bar dataKey="amount" fill="#6366f1" radius={[4, 4, 0, 0]} name="Total spent" />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}

      {/* Payday pattern */}
      {insights.paydayPattern && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Spending by Day of Month</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xs text-gray-400 dark:text-gray-500 mb-3">
              Detected payday{insights.paydayPattern.detectedPaydays.length > 1 ? "s" : ""}: day{" "}
              {insights.paydayPattern.detectedPaydays.join(" & ")} of the month.
              Look for spending spikes right after payday.
            </p>
            <ResponsiveContainer width="100%" height={180}>
              <BarChart data={insights.paydayPattern.spendingByDayOfMonth.filter((d) => d.count > 0)}>
                <XAxis dataKey="day" tick={{ fontSize: 10 }} />
                <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => formatAxisCurrency(Number(v))} />
                <Tooltip formatter={(v) => formatCurrency(Number(v))} labelFormatter={(d) => `Day ${d}`} />
                {insights.paydayPattern.spendingByDayOfMonth
                  .filter((d) => d.count > 0)
                  .map((d) => null) /* just for reference */}
                <Bar dataKey="amount" radius={[3, 3, 0, 0]} name="Spending">
                  {insights.paydayPattern.spendingByDayOfMonth
                    .filter((d) => d.count > 0)
                    .map((d) => (
                      <Cell
                        key={d.day}
                        fill={insights.paydayPattern!.detectedPaydays.includes(d.day) ? "#22c55e" : "#6366f1"}
                      />
                    ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
            <p className="text-[10px] text-gray-400 dark:text-gray-500 mt-1">Green bars = detected payday</p>
          </CardContent>
        </Card>
      )}

      {/* Transaction size distribution */}
      {insights.txSizeDistribution && insights.txSizeDistribution.some((b) => b.count > 0) && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Transaction Size Distribution</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xs text-gray-400 dark:text-gray-500 mb-3">How your spending is spread across transaction sizes.</p>
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={insights.txSizeDistribution}>
                <XAxis dataKey="label" tick={{ fontSize: 10 }} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip
                  formatter={(v, name) => [
                    name === "count" ? `${v} transactions` : formatCurrency(Number(v)),
                    name === "count" ? "Count" : "Total spent",
                  ]}
                />
                <Legend />
                <Bar dataKey="count" fill="#6366f1" radius={[4, 4, 0, 0]} name="count" />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}

      {/* Hygiene score */}
      {insights.hygiene && insights.hygiene.totalTxCount > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Categorization Health</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-6 flex-wrap">
              <div className="relative w-24 h-24 shrink-0">
                <svg viewBox="0 0 36 36" className="w-full h-full -rotate-90">
                  <circle cx="18" cy="18" r="15.9" fill="none" stroke="#e5e7eb" strokeWidth="3" />
                  <circle
                    cx="18" cy="18" r="15.9" fill="none"
                    stroke={insights.hygiene.score >= 80 ? "#22c55e" : insights.hygiene.score >= 60 ? "#f59e0b" : "#ef4444"}
                    strokeWidth="3"
                    strokeDasharray={`${insights.hygiene.score} ${100 - insights.hygiene.score}`}
                    strokeLinecap="round"
                  />
                </svg>
                <div className="absolute inset-0 flex flex-col items-center justify-center">
                  <span className="text-xl font-bold text-gray-900 dark:text-gray-100">{insights.hygiene.score}</span>
                  <span className="text-[10px] text-gray-400 dark:text-gray-500">/100</span>
                </div>
              </div>
              <div className="space-y-2 flex-1 min-w-48">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-gray-500 dark:text-gray-400">Transactions categorized</span>
                  <span className="font-medium">{insights.hygiene.categorizedCount}/{insights.hygiene.totalTxCount} ({insights.hygiene.categorizedPct}%)</span>
                </div>
                <div className="h-1.5 bg-gray-100 dark:bg-gray-800 rounded-full overflow-hidden">
                  <div className="h-full bg-indigo-500 rounded-full" style={{ width: `${insights.hygiene.categorizedPct}%` }} />
                </div>
                <div className="flex items-center justify-between text-sm mt-2">
                  <span className="text-gray-500 dark:text-gray-400">Spend amount categorized</span>
                  <span className="font-medium">{insights.hygiene.categorizedAmountPct}%</span>
                </div>
                <div className="h-1.5 bg-gray-100 dark:bg-gray-800 rounded-full overflow-hidden">
                  <div className="h-full bg-indigo-400 rounded-full" style={{ width: `${insights.hygiene.categorizedAmountPct}%` }} />
                </div>
                {insights.hygiene.score < 80 && (
                  <p className="text-xs text-amber-600 mt-2">
                    {insights.hygiene.categorizedPct < 80
                      ? `${insights.hygiene.totalTxCount - insights.hygiene.categorizedCount} transactions still uncategorized — visit Transactions to tag them.`
                      : "Most transactions are categorized but some large amounts are not."}
                  </p>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
