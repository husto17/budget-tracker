"use client";

import { useState, useEffect } from "react";
import { format, parseISO } from "date-fns";
import {
  BarChart, Bar, PieChart, Pie, Cell, LineChart, Line, AreaChart, Area,
  XAxis, YAxis, Tooltip, ResponsiveContainer, Legend,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  TrendingUp, TrendingDown, AlertTriangle, Repeat, BarChart3,
  ArrowUpRight, ArrowDownRight, Receipt, Store, Target,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Skeleton } from "@/components/ui/skeleton";
import { formatCurrency } from "@/lib/fetcher";
import { CategoryIcon } from "@/components/ui/category-icon";
import { MerchantLogo } from "@/components/ui/merchant-logo";
import { MonthPicker } from "@/components/ui/month-picker";
import { PALETTE as CHART_COLORS } from "@/lib/palette";

interface InsightData {
  monthlyTotals: Record<string, number>;
  monthlyByCategory: Record<string, Record<string, number>>;
  thisMonthTotal: number;
  lastMonthTotal: number;
  momChange: number;
  previousMonthSpending: number;
  categorySpendingPrevMonth: Record<string, number>;
  topCategories: [string, number][];
  recurring: Array<{ name: string; amount: number; months: number }>;
  anomalies: Array<{ category: string; thisMonth: number; average: number; ratio: number }>;
  budgetUtilization: Array<{ category: string; color: string; spent: number; budget: number; remaining: number; pct: number }>;
  incomeVsSpending: Array<{ month: string; income: number; spending: number; net: number }>;
  spendingByMember: Record<string, { name: string; amount: number }>;
  pendingCount: number;
  pendingTotal: number;
  dailySpending: Array<{ date: string; amount: number }>;
  subscriptions: Array<{
    merchant: string;
    amount: number;
    categoryId: string | null;
    categoryName: string | null;
    lastDate: string;
    monthlyCount: number;
  }>;
  topMerchants: Array<{ merchant: string; amount: number; count: number; categoryName: string | null; categoryColor: string | null }>;
  recent: Array<{
    id: string;
    date: string;
    description: string;
    amount: number;
    isCredit: boolean;
    accountName: string;
    category: { name: string; color: string; icon: string | null } | null;
  }>;
}

interface Account {
  id: string;
  name: string;
  type: string;
  isJoint: boolean;
  owner: "me" | "partner";
  computedBalance: number;
}

function formatMonth(key: string) {
  const [year, month] = key.split("-");
  return format(new Date(parseInt(year), parseInt(month) - 1, 1), "MMM yy");
}

type ViewFilter = "all" | "mine" | "partner" | "joint";

function currentMonthKey(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

interface GoalLite {
  id: string;
  name: string;
  targetAmount: number;
  currentAmount: number;
  targetDate: string | null;
  color: string;
}

export default function DashboardPage() {
  const router = useRouter();
  const [insights, setInsights] = useState<InsightData | null>(null);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [goals, setGoals] = useState<GoalLite[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [selectedMonth, setSelectedMonth] = useState<string>(currentMonthKey);
  const isCurrentMonth = selectedMonth === currentMonthKey();

  const [viewFilter, setViewFilterState] = useState<ViewFilter>(() => {
    if (typeof window === "undefined") return "all";
    try {
      const saved = localStorage.getItem("dashboard:viewFilter");
      if (saved === "all" || saved === "mine" || saved === "partner" || saved === "joint") {
        return saved;
      }
    } catch {}
    return "all";
  });

  function setViewFilter(next: ViewFilter) {
    setViewFilterState(next);
    try { localStorage.setItem("dashboard:viewFilter", next); } catch {}
  }

  useEffect(() => {
    setLoading(true);
    const url = isCurrentMonth
      ? "/api/insights"
      : `/api/insights?month=${selectedMonth}`;
    Promise.all([
      fetch(url).then((r) => {
        if (!r.ok) throw new Error(`insights ${r.status}`);
        return r.json();
      }),
      fetch("/api/accounts").then((r) => {
        if (!r.ok) throw new Error(`accounts ${r.status}`);
        return r.json();
      }),
      fetch("/api/goals").then((r) => (r.ok ? r.json() : [])).catch(() => []),
    ])
      .then(([ins, accs, gls]) => {
        setInsights(ins);
        setAccounts(accs);
        setGoals(gls ?? []);
      })
      .catch((e: Error) => {
        setLoadError(e.message);
      })
      .finally(() => setLoading(false));
  }, [selectedMonth, isCurrentMonth]);

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="space-y-2">
          <Skeleton className="h-7 w-40" />
          <Skeleton className="h-4 w-32" />
        </div>
        <Skeleton className="h-44 w-full rounded-2xl" />
        <div className="grid grid-cols-3 gap-3 md:gap-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <Card key={i}>
              <CardContent className="pt-5 pb-4 space-y-2">
                <Skeleton className="h-3 w-20" />
                <Skeleton className="h-7 w-28" />
              </CardContent>
            </Card>
          ))}
        </div>
        <div className="grid md:grid-cols-2 gap-6">
          <Card><CardContent className="p-6"><Skeleton className="h-52 w-full" /></CardContent></Card>
          <Card><CardContent className="p-6"><Skeleton className="h-52 w-full" /></CardContent></Card>
        </div>
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <p className="text-sm text-red-600 font-medium">Couldn&apos;t load dashboard</p>
          <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">{loadError}</p>
          <button
            onClick={() => window.location.reload()}
            className="mt-3 text-sm text-blue-600 hover:underline"
          >
            Try again
          </button>
        </div>
      </div>
    );
  }

  if (!insights) return null;

  // Label for the currently-viewed month (respects the period selector).
  const [selYear, selMonth] = selectedMonth.split("-").map(Number);
  const thisMonth = format(new Date(selYear, selMonth - 1, 1), "MMMM yyyy");

  // Empty state: no accounts at all
  if (accounts.length === 0 && insights.thisMonthTotal === 0) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="text-center max-w-md mx-auto p-8 bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 shadow-sm space-y-4">
          <div className="flex justify-center">
            <div className="w-16 h-16 bg-blue-50 rounded-full flex items-center justify-center">
              <BarChart3 className="w-8 h-8 text-blue-500" />
            </div>
          </div>
          <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100">Welcome to Budget Tracker</h2>
          <p className="text-gray-500 dark:text-gray-400 text-sm">
            Get started by adding your accounts and uploading your first bank statement.
          </p>
          <div className="flex flex-col sm:flex-row gap-3 justify-center pt-2">
            <Link
              href="/accounts"
              className="inline-flex items-center justify-center rounded-lg bg-primary text-primary-foreground px-4 py-2 text-sm font-medium transition-colors hover:bg-primary/80"
            >
              Add an account
            </Link>
            <Link
              href="/upload"
              className="inline-flex items-center justify-center rounded-lg border border-border bg-background px-4 py-2 text-sm font-medium transition-colors hover:bg-muted"
            >
              Upload a statement
            </Link>
          </div>
        </div>
      </div>
    );
  }

  if (accounts.length > 0 && insights.thisMonthTotal === 0 && Object.keys(insights.monthlyTotals).length === 0) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="text-center max-w-md mx-auto p-8 bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 shadow-sm space-y-4">
          <div className="flex justify-center">
            <div className="w-16 h-16 bg-green-50 rounded-full flex items-center justify-center">
              <BarChart3 className="w-8 h-8 text-green-500" />
            </div>
          </div>
          <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100">Your accounts are set up!</h2>
          <p className="text-gray-500 dark:text-gray-400 text-sm">
            Now upload your statements to start tracking your spending.
          </p>
          <Link
            href="/upload"
            className="inline-flex items-center justify-center rounded-lg bg-primary text-primary-foreground px-4 py-2 text-sm font-medium transition-colors hover:bg-primary/80"
          >
            Upload a statement
          </Link>
        </div>
      </div>
    );
  }

  const filteredAccounts = accounts.filter((a) => {
    if (viewFilter === "all") return true;
    if (viewFilter === "mine") return a.owner === "me" && !a.isJoint;
    if (viewFilter === "partner") return a.owner === "partner";
    if (viewFilter === "joint") return a.isJoint;
    return true;
  });

  const hasPartner = accounts.some((a) => a.owner === "partner");

  const netBalance = filteredAccounts.reduce((sum, a) => {
    if (a.type === "CREDIT_CARD") return sum - Math.abs(a.computedBalance);
    return sum + a.computedBalance;
  }, 0);

  const monthlySpendingData = Object.entries(insights.monthlyTotals)
    .sort(([a], [b]) => a.localeCompare(b))
    .slice(-6)
    .map(([month, total]) => ({ month: formatMonth(month), total, key: month }));

  function jumpToMonth(monthKey: string) {
    const [y, m] = monthKey.split("-").map(Number);
    const from = `${monthKey}-01`;
    const to = new Date(y, m, 0).toISOString().slice(0, 10); // last day of month
    router.push(`/transactions?from=${from}&to=${to}`);
  }

  const pieData = insights.topCategories.slice(0, 6).map(([name, value]) => ({ name, value }));
  const pieTotal = pieData.reduce((s, d) => s + d.value, 0);

  const incomeSpendingData = insights.incomeVsSpending.slice(-6).map((d) => ({ ...d, month: formatMonth(d.month) }));

  const momDelta = insights.thisMonthTotal - insights.previousMonthSpending;
  const momUp = momDelta > 0;
  const recurringMonthly = insights.recurring.reduce((s, r) => s + r.amount, 0);

  // Cash-flow forecast — linear projection of this month's spend using the
  // average daily pace so far. Compared to last month as the budget baseline.
  const today = new Date();
  const daysInMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate();
  const dayOfMonth = today.getDate();
  const projectedMonthTotal =
    dayOfMonth > 0
      ? (insights.thisMonthTotal / dayOfMonth) * daysInMonth
      : insights.thisMonthTotal;
  const forecastDelta = projectedMonthTotal - insights.previousMonthSpending;
  const forecastPct =
    insights.previousMonthSpending > 0
      ? (forecastDelta / insights.previousMonthSpending) * 100
      : 0;
  const daysLeft = daysInMonth - dayOfMonth;

  // Upcoming bills — projected next charge for each detected subscription.
  // Uses 30-day cadence from the last-seen date; filter to next 21 days.
  const nowMs = Date.now();
  const DAY = 86400000;
  const upcomingBills = (insights.subscriptions ?? [])
    .map((s) => {
      const last = new Date(s.lastDate).getTime();
      if (isNaN(last)) return null;
      const next = last + 30 * DAY;
      const days = Math.round((next - nowMs) / DAY);
      return { ...s, nextDate: next, daysUntil: days };
    })
    .filter((b): b is NonNullable<typeof b> => !!b && b.daysUntil >= -2 && b.daysUntil <= 21)
    .sort((a, b) => a.daysUntil - b.daysUntil)
    .slice(0, 5);

  // This month's category totals for the stacked strip
  // Use the currently-selected month key so the strip reflects the viewed
  // period, not always "today". Matches the same month the API anchored to.
  const thisMonthKey = selectedMonth;
  const thisMonthByCategory = insights.monthlyByCategory[thisMonthKey] ?? {};
  const stripTotal = Object.values(thisMonthByCategory).reduce((s, v) => s + v, 0);
  const stripSegments = Object.entries(thisMonthByCategory)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 8)
    .map(([name, value], i) => ({
      name,
      value,
      pct: stripTotal > 0 ? (value / stripTotal) * 100 : 0,
      color: CHART_COLORS[i % CHART_COLORS.length],
    }));

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Dashboard</h1>
          <div className="flex items-center gap-2 mt-1 flex-wrap">
            <MonthPicker value={selectedMonth} onChange={setSelectedMonth} max={currentMonthKey()} />
            {!isCurrentMonth && (
              <button
                onClick={() => setSelectedMonth(currentMonthKey())}
                className="text-xs text-indigo-600 dark:text-indigo-400 hover:underline"
              >
                Jump to this month
              </button>
            )}
          </div>
        </div>
        {hasPartner && (
          <div className="flex gap-1 bg-gray-100 dark:bg-gray-800 rounded-lg p-1">
            {(["all", "mine", "partner", "joint"] as ViewFilter[]).map((f) => (
              <button
                key={f}
                onClick={() => setViewFilter(f)}
                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors capitalize ${
                  viewFilter === f
                    ? "bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 shadow-sm"
                    : "text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:text-gray-200"
                }`}
              >
                {f === "all" ? "All" : f === "mine" ? "Mine" : f === "partner" ? "Partner's" : "Joint"}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* HERO: Net Balance with sparkline */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-slate-900 via-indigo-900 to-slate-900 text-white shadow-lg">
        <div className="absolute inset-0 opacity-30 pointer-events-none">
          <div className="absolute top-0 right-0 w-96 h-96 bg-indigo-500 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2" />
          <div className="absolute bottom-0 left-0 w-80 h-80 bg-purple-500 rounded-full blur-3xl translate-y-1/2 -translate-x-1/2" />
        </div>
        <div className="relative grid md:grid-cols-[1fr_auto] gap-6 p-6 md:p-8 items-end">
          <div>
            <p className="text-indigo-200 text-xs font-medium uppercase tracking-wider">Net Balance</p>
            <p className="text-4xl md:text-5xl font-bold mt-2 tracking-tight">{formatCurrency(netBalance)}</p>
            <div className="flex items-center gap-2 mt-3 text-sm">
              <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${
                momUp ? "bg-red-500/20 text-red-200" : "bg-emerald-500/20 text-emerald-200"
              }`}>
                {momUp ? <ArrowUpRight className="w-3 h-3" /> : <ArrowDownRight className="w-3 h-3" />}
                {formatCurrency(Math.abs(momDelta))}
              </span>
              <span className="text-indigo-200">vs last month</span>
            </div>
          </div>
          <div className="h-20 w-full md:w-64">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={insights.dailySpending}>
                <defs>
                  <linearGradient id="sparkFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#a5b4fc" stopOpacity={0.6} />
                    <stop offset="95%" stopColor="#a5b4fc" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <Tooltip
                  contentStyle={{ background: "rgba(15,23,42,0.9)", border: "none", borderRadius: 6, fontSize: 11, color: "#fff" }}
                  labelStyle={{ color: "#c7d2fe" }}
                  formatter={(v) => [formatCurrency(Number(v ?? 0)), "spent"]}
                  labelFormatter={(d) => format(parseISO(d as string), "d MMM")}
                />
                <Area type="monotone" dataKey="amount" stroke="#c7d2fe" strokeWidth={2} fill="url(#sparkFill)" />
              </AreaChart>
            </ResponsiveContainer>
            <p className="text-indigo-200 text-[10px] mt-1 text-center uppercase tracking-wide">Last 30 days</p>
          </div>
        </div>
      </div>

      {/* Forecast strip — only meaningful when viewing the current in-progress month */}
      {isCurrentMonth && insights.thisMonthTotal > 0 && dayOfMonth < daysInMonth && (
        <div className="bg-white dark:bg-gray-900 ring-1 ring-gray-200 dark:ring-gray-800/80 rounded-xl px-4 py-3 flex items-center gap-4 flex-wrap">
          <div className="flex-1 min-w-[180px]">
            <p className="text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wide">Projected end of {thisMonth.split(" ")[0]}</p>
            <p className="text-xl font-bold mt-0.5">{formatCurrency(projectedMonthTotal)}</p>
          </div>
          <div className="flex-1 min-w-[140px]">
            <p className="text-xs text-gray-400 dark:text-gray-500">vs last month</p>
            <p className={`text-sm font-semibold ${forecastDelta > 0 ? "text-rose-600" : "text-emerald-600"}`}>
              {forecastDelta > 0 ? "+" : "−"}{formatCurrency(Math.abs(forecastDelta))}
              {insights.previousMonthSpending > 0 && (
                <span className="text-gray-400 dark:text-gray-500 font-normal"> ({forecastPct > 0 ? "+" : ""}{forecastPct.toFixed(0)}%)</span>
              )}
            </p>
          </div>
          <div className="flex-1 min-w-[160px]">
            <p className="text-xs text-gray-400 dark:text-gray-500">Pace</p>
            <p className="text-sm text-gray-700 dark:text-gray-200">
              {formatCurrency(insights.thisMonthTotal / dayOfMonth)}/day
              <span className="text-gray-400 dark:text-gray-500"> · {daysLeft} day{daysLeft !== 1 ? "s" : ""} left</span>
            </p>
          </div>
        </div>
      )}

      {/* Secondary stats — tighter on mobile so $x,xxx.xx fits all three in a row */}
      <div className="grid grid-cols-3 gap-2 sm:gap-3 md:gap-4">
        <Card className="relative overflow-hidden border-0 bg-gradient-to-br from-rose-50 to-white ring-1 ring-rose-100/80">
          <div className="hidden sm:flex absolute top-4 right-4 w-8 h-8 rounded-full bg-rose-100 items-center justify-center">
            <TrendingDown className="w-4 h-4 text-rose-600" />
          </div>
          <CardContent className="p-3 sm:pt-5 sm:pb-4 sm:px-6">
            <p className="text-gray-500 dark:text-gray-400 text-[10px] sm:text-xs font-medium uppercase tracking-wide">
              {isCurrentMonth ? "This Month" : format(new Date(selYear, selMonth - 1, 1), "MMM yyyy")}
            </p>
            <p className="text-base sm:text-2xl font-bold mt-0.5 sm:mt-1 text-gray-900 dark:text-gray-100 tabular-nums">{formatCurrency(insights.thisMonthTotal)}</p>
            {insights.previousMonthSpending > 0 && (
              <p className={`text-[10px] sm:text-xs mt-0.5 sm:mt-1 tabular-nums ${momUp ? "text-rose-600" : "text-emerald-600"}`}>
                {momUp ? "↑" : "↓"} {formatCurrency(Math.abs(momDelta))} <span className="hidden sm:inline">vs prev</span>
              </p>
            )}
          </CardContent>
        </Card>
        <Card className="relative overflow-hidden border-0 bg-gradient-to-br from-sky-50 to-white ring-1 ring-sky-100/80">
          <div className="hidden sm:flex absolute top-4 right-4 w-8 h-8 rounded-full bg-sky-100 items-center justify-center">
            <Receipt className="w-4 h-4 text-sky-600" />
          </div>
          <CardContent className="p-3 sm:pt-5 sm:pb-4 sm:px-6">
            <p className="text-gray-500 dark:text-gray-400 text-[10px] sm:text-xs font-medium uppercase tracking-wide">
              {isCurrentMonth ? "Last Month" : format(new Date(selYear, selMonth - 2, 1), "MMM yyyy")}
            </p>
            <p className="text-base sm:text-2xl font-bold mt-0.5 sm:mt-1 text-gray-900 dark:text-gray-100 tabular-nums">{formatCurrency(insights.lastMonthTotal)}</p>
            <p className="hidden sm:block text-xs text-gray-400 dark:text-gray-500 mt-1">Final total</p>
          </CardContent>
        </Card>
        <Card className="relative overflow-hidden border-0 bg-gradient-to-br from-violet-50 to-white ring-1 ring-violet-100/80">
          <div className="hidden sm:flex absolute top-4 right-4 w-8 h-8 rounded-full bg-violet-100 items-center justify-center">
            <Repeat className="w-4 h-4 text-violet-600" />
          </div>
          <CardContent className="p-3 sm:pt-5 sm:pb-4 sm:px-6">
            <p className="text-gray-500 dark:text-gray-400 text-[10px] sm:text-xs font-medium uppercase tracking-wide">Recurring</p>
            <p className="text-base sm:text-2xl font-bold mt-0.5 sm:mt-1 text-gray-900 dark:text-gray-100 tabular-nums">{formatCurrency(recurringMonthly)}</p>
            <p className="hidden sm:block text-xs text-gray-400 dark:text-gray-500 mt-1">{insights.recurring.length} subscriptions</p>
          </CardContent>
        </Card>
      </div>

      {/* Month-at-a-glance strip */}
      {stripSegments.length > 0 && (
        <Card className="border-0 ring-1 ring-gray-200 dark:ring-gray-800/80">
          <CardContent className="pt-5 pb-5">
            <div className="flex items-center justify-between mb-3">
              <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">Month at a glance</p>
              <p className="text-xs text-gray-400 dark:text-gray-500">{formatCurrency(stripTotal)} total</p>
            </div>
            <div className="flex h-2.5 rounded-full overflow-hidden bg-gray-100 dark:bg-gray-800">
              {stripSegments.map((s) => (
                <Link
                  key={s.name}
                  href={`/transactions?categoryName=${encodeURIComponent(s.name)}`}
                  style={{ width: `${s.pct}%`, backgroundColor: s.color }}
                  className="group relative transition-opacity hover:opacity-80"
                  title={`${s.name}: ${formatCurrency(s.value)}`}
                />
              ))}
            </div>
            <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1.5 text-xs">
              {stripSegments.map((s) => (
                <Link
                  key={s.name}
                  href={`/transactions?categoryName=${encodeURIComponent(s.name)}`}
                  className="flex items-center gap-1.5 text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:text-gray-100"
                >
                  <span className="w-2 h-2 rounded-full" style={{ backgroundColor: s.color }} />
                  <span>{s.name}</span>
                  <span className="text-gray-400 dark:text-gray-500">{formatCurrency(s.value)}</span>
                </Link>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Pending / anomaly banners */}
      {insights.pendingCount > 0 && (
        <Link
          href="/transactions?status=pending"
          className="flex items-center justify-between bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 hover:bg-amber-100 transition-colors"
        >
          <p className="text-sm text-amber-700 font-medium">
            {insights.pendingCount} pending transaction{insights.pendingCount !== 1 ? "s" : ""}{" "}
            &bull; {formatCurrency(insights.pendingTotal)} estimated
          </p>
          <span className="text-xs text-amber-600 font-medium">View →</span>
        </Link>
      )}

      {insights.anomalies.length > 0 && (
        <div className="space-y-2">
          {insights.anomalies.map((a) => (
            <Link
              key={a.category}
              href={`/transactions?categoryName=${encodeURIComponent(a.category)}`}
              className="flex items-center gap-3 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 hover:bg-amber-100 transition-colors"
            >
              <AlertTriangle className="w-4 h-4 text-amber-500 flex-shrink-0" />
              <p className="text-sm text-amber-700 flex-1">
                <strong>{a.category}</strong> spending is {formatCurrency(a.thisMonth)} this month —{" "}
                {a.ratio.toFixed(1)}× your usual average of {formatCurrency(a.average)}.
              </p>
              <span className="text-xs text-amber-600 font-medium shrink-0">View →</span>
            </Link>
          ))}
        </div>
      )}

      {/* Upcoming bills — next 21 days */}
      {upcomingBills.length > 0 && (
        <Card className="border-0 ring-1 ring-gray-200 dark:ring-gray-800/80">
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <Repeat className="w-4 h-4" /> Upcoming bills
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="divide-y divide-gray-50 dark:divide-gray-800">
              {upcomingBills.map((b) => {
                const due =
                  b.daysUntil < 0
                    ? `Due ${Math.abs(b.daysUntil)}d ago`
                    : b.daysUntil === 0
                    ? "Due today"
                    : b.daysUntil === 1
                    ? "Due tomorrow"
                    : `Due in ${b.daysUntil}d`;
                const urgent = b.daysUntil <= 2;
                return (
                  <Link
                    key={b.merchant}
                    href={`/transactions?search=${encodeURIComponent(b.merchant)}`}
                    className="flex items-center gap-3 py-2.5 hover:bg-gray-50 dark:hover:bg-gray-800 -mx-2 px-2 rounded-lg transition-colors"
                  >
                    <MerchantLogo merchant={b.merchant} fallbackColor={null} />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">{b.merchant}</p>
                      <p className={`text-xs ${urgent ? "text-amber-600 font-medium" : "text-gray-400 dark:text-gray-500"}`}>
                        {due} · {format(new Date(b.nextDate), "d MMM")}
                        {b.categoryName && <span className="text-gray-400 dark:text-gray-500"> · {b.categoryName}</span>}
                      </p>
                    </div>
                    <span className="text-sm font-semibold shrink-0">{formatCurrency(b.amount)}</span>
                  </Link>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Household breakdown */}
      {Object.keys(insights.spendingByMember).length > 0 && (
        <div>
          <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-200 mb-2">Household Breakdown — {thisMonth}</h2>
          <div className="grid grid-cols-2 gap-3">
            {Object.entries(insights.spendingByMember).map(([uid, member]) => (
              <Card key={uid} className="border-0 ring-1 ring-gray-200 dark:ring-gray-800/80">
                <CardContent className="pt-4 pb-3">
                  <p className="text-xs text-gray-400 dark:text-gray-500 font-medium">{member.name}&apos;s spending</p>
                  <p className="text-xl font-bold mt-1">{formatCurrency(member.amount)}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}

      {/* Charts row */}
      <div className="grid md:grid-cols-2 gap-6">
        {/* Monthly spending trend (area with gradient) */}
        <Card className="border-0 ring-1 ring-gray-200 dark:ring-gray-800/80">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <TrendingUp className="w-4 h-4" /> Monthly Spending
            </CardTitle>
          </CardHeader>
          <CardContent>
            {monthlySpendingData.length === 0 ? (
              <p className="text-sm text-gray-400 dark:text-gray-500 py-8 text-center">No data yet</p>
            ) : (
              <ResponsiveContainer width="100%" height={220}>
                <AreaChart data={monthlySpendingData}>
                  <defs>
                    <linearGradient id="totalFill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#6366F1" stopOpacity={0.35} />
                      <stop offset="95%" stopColor="#6366F1" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <XAxis dataKey="month" tick={{ fontSize: 11 }} stroke="#9ca3af" />
                  <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`} stroke="#9ca3af" />
                  <Tooltip
                    contentStyle={{ background: "white", border: "1px solid #e5e7eb", borderRadius: 6, fontSize: 12 }}
                    formatter={(v) => formatCurrency(Number(v ?? 0))}
                  />
                  <Area type="monotone" dataKey="total" stroke="#6366F1" strokeWidth={2} fill="url(#totalFill)" />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        {/* Donut: Spending this month */}
        <Card className="border-0 ring-1 ring-gray-200 dark:ring-gray-800/80">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <BarChart3 className="w-4 h-4" /> Spending This Month
            </CardTitle>
          </CardHeader>
          <CardContent>
            {pieData.length === 0 ? (
              <p className="text-sm text-gray-400 dark:text-gray-500 py-8 text-center">No categorized transactions this month</p>
            ) : (
              <div className="relative">
                <ResponsiveContainer width="100%" height={220}>
                  <PieChart>
                    <Pie
                      data={pieData}
                      dataKey="value"
                      nameKey="name"
                      cx="50%"
                      cy="50%"
                      innerRadius={55}
                      outerRadius={85}
                      paddingAngle={2}
                      stroke="none"
                      style={{ cursor: "pointer" }}
                      onClick={(entry) => entry.name && router.push(`/transactions?categoryName=${encodeURIComponent(entry.name)}`)}
                    >
                      {pieData.map((_, i) => (
                        <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip formatter={(v) => formatCurrency(Number(v ?? 0))} />
                  </PieChart>
                </ResponsiveContainer>
                <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                  <p className="text-xs text-gray-400 dark:text-gray-500 uppercase tracking-wider">Total</p>
                  <p className="text-lg font-bold text-gray-900 dark:text-gray-100">{formatCurrency(pieTotal)}</p>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Income vs spending line chart */}
      {incomeSpendingData.length > 0 && (
        <Card className="border-0 ring-1 ring-gray-200 dark:ring-gray-800/80">
          <CardHeader>
            <CardTitle className="text-base">Income vs Spending</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={220}>
              <LineChart data={incomeSpendingData}>
                <XAxis dataKey="month" tick={{ fontSize: 11 }} stroke="#9ca3af" />
                <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`} stroke="#9ca3af" />
                <Tooltip formatter={(v) => formatCurrency(Number(v ?? 0))} />
                <Legend />
                <Line type="monotone" dataKey="income" stroke="#22C55E" strokeWidth={2.5} dot={false} name="Income" />
                <Line type="monotone" dataKey="spending" stroke="#EF4444" strokeWidth={2.5} dot={false} name="Spending" />
                <Line type="monotone" dataKey="net" stroke="#6366F1" strokeWidth={2} strokeDasharray="4 2" dot={false} name="Net" />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}

      {/* Budget utilization as rings */}
      {insights.budgetUtilization.length > 0 && (
        <Card className="border-0 ring-1 ring-gray-200 dark:ring-gray-800/80">
          <CardHeader>
            <CardTitle className="text-base">Budgets — {thisMonth}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid sm:grid-cols-2 md:grid-cols-3 gap-4">
              {insights.budgetUtilization.map((b) => {
                const pct = Math.min(Math.max(b.pct, 0), 100);
                const over = b.remaining < 0;
                const ringColor = over ? "#EF4444" : b.color;
                const circumference = 2 * Math.PI * 28;
                const dash = (pct / 100) * circumference;
                return (
                  <div key={b.category} className="flex items-center gap-3">
                    <div className="relative w-16 h-16 shrink-0">
                      <svg viewBox="0 0 64 64" className="w-16 h-16 -rotate-90">
                        <circle cx="32" cy="32" r="28" fill="none" stroke="#f3f4f6" strokeWidth="6" />
                        <circle
                          cx="32"
                          cy="32"
                          r="28"
                          fill="none"
                          stroke={ringColor}
                          strokeWidth="6"
                          strokeLinecap="round"
                          strokeDasharray={`${dash} ${circumference}`}
                        />
                      </svg>
                      <div className="absolute inset-0 flex items-center justify-center">
                        <span className="text-xs font-bold text-gray-900 dark:text-gray-100">{Math.round(pct)}%</span>
                      </div>
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium truncate">{b.category}</p>
                      <p className="text-xs text-gray-500 dark:text-gray-400">
                        {formatCurrency(b.spent)} / {formatCurrency(b.budget)}
                      </p>
                      <p className={`text-xs mt-0.5 ${over ? "text-red-600 font-medium" : "text-gray-400 dark:text-gray-500"}`}>
                        {over ? `Over by ${formatCurrency(Math.abs(b.remaining))}` : `${formatCurrency(b.remaining)} left`}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Recent activity + Top merchants */}
      <div className="grid md:grid-cols-2 gap-6">
        <Card className="border-0 ring-1 ring-gray-200 dark:ring-gray-800/80">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base flex items-center gap-2">
                <Receipt className="w-4 h-4" /> Recent Activity
              </CardTitle>
              <Link href="/transactions" className="text-xs text-blue-600 hover:underline">View all →</Link>
            </div>
          </CardHeader>
          <CardContent>
            {insights.recent.length === 0 ? (
              <p className="text-sm text-gray-400 dark:text-gray-500 py-4 text-center">No transactions yet</p>
            ) : (
              <div className="divide-y divide-gray-50 dark:divide-gray-800">
                {insights.recent.map((tx) => (
                  <div key={tx.id} className="flex items-center gap-3 py-2.5">
                    <MerchantLogo merchant={tx.description} fallbackColor={tx.category?.color} />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">{tx.description}</p>
                      <p className="text-xs text-gray-400 dark:text-gray-500 flex items-center gap-1.5">
                        {tx.category && (
                          <span className="inline-flex items-center gap-1">
                            <CategoryIcon icon={tx.category.icon} color={tx.category.color} size="sm" />
                            {tx.category.name}
                          </span>
                        )}
                        {tx.category && <span className="text-gray-300 dark:text-gray-600">·</span>}
                        <span>{format(parseISO(tx.date), "d MMM")}</span>
                        <span className="text-gray-300 dark:text-gray-600">·</span>
                        <span className="truncate">{tx.accountName}</span>
                      </p>
                    </div>
                    <span className={`text-sm font-semibold shrink-0 ${tx.isCredit ? "text-emerald-600" : "text-gray-900 dark:text-gray-100"}`}>
                      {tx.isCredit ? "+" : "−"}{formatCurrency(tx.amount)}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="border-0 ring-1 ring-gray-200 dark:ring-gray-800/80">
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <Store className="w-4 h-4" /> Top Merchants — {thisMonth}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {insights.topMerchants.length === 0 ? (
              <p className="text-sm text-gray-400 dark:text-gray-500 py-4 text-center">No merchants this month yet</p>
            ) : (
              <div className="space-y-2.5">
                {insights.topMerchants.map((m, i) => {
                  const maxAmount = insights.topMerchants[0].amount;
                  const pct = maxAmount > 0 ? (m.amount / maxAmount) * 100 : 0;
                  return (
                    <Link
                      key={m.merchant}
                      href={`/transactions?search=${encodeURIComponent(m.merchant)}`}
                      className="block group"
                    >
                      <div className="flex items-center justify-between gap-2 mb-1">
                        <div className="flex items-center gap-2 min-w-0">
                          <MerchantLogo merchant={m.merchant} fallbackColor={m.categoryColor} size="sm" />
                          <span className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate group-hover:text-blue-600">
                            {m.merchant}
                          </span>
                          {m.categoryName && (
                            <Badge variant="outline" className="text-[10px] h-4 px-1.5 shrink-0">
                              {m.categoryName}
                            </Badge>
                          )}
                        </div>
                        <span className="text-sm font-semibold shrink-0">{formatCurrency(m.amount)}</span>
                      </div>
                      <div className="h-1.5 bg-gray-100 dark:bg-gray-800 rounded-full overflow-hidden ml-10">
                        <div
                          className="h-full rounded-full transition-all"
                          style={{
                            width: `${pct}%`,
                            backgroundColor: m.categoryColor ?? "#6366F1",
                          }}
                        />
                      </div>
                    </Link>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Goals widget — compact strip of in-progress goals */}
      {goals.length > 0 && (
        <Card className="border-0 ring-1 ring-gray-200 dark:ring-gray-800/80">
          <CardHeader className="pb-3 flex-row items-center justify-between gap-2 space-y-0">
            <CardTitle className="text-base flex items-center gap-2">
              <Target className="w-4 h-4 text-indigo-500" /> Goals
            </CardTitle>
            <Link href="/goals" className="text-xs text-blue-600 hover:underline">See all</Link>
          </CardHeader>
          <CardContent>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {goals
                .filter((g) => g.currentAmount < g.targetAmount)
                .sort((a, b) => {
                  const ad = a.targetDate ? new Date(a.targetDate).getTime() : Infinity;
                  const bd = b.targetDate ? new Date(b.targetDate).getTime() : Infinity;
                  return ad - bd;
                })
                .slice(0, 3)
                .map((g) => {
                  const pct = Math.min((g.currentAmount / g.targetAmount) * 100, 100);
                  const remaining = g.targetAmount - g.currentAmount;
                  let monthly: number | null = null;
                  if (g.targetDate) {
                    const target = new Date(g.targetDate);
                    const now = new Date();
                    const monthsLeft =
                      (target.getFullYear() - now.getFullYear()) * 12 +
                      (target.getMonth() - now.getMonth());
                    monthly = monthsLeft > 0 ? remaining / monthsLeft : remaining;
                  }
                  return (
                    <Link
                      key={g.id}
                      href="/goals"
                      className="block p-3 rounded-lg border border-gray-100 dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-gray-800/40 transition-colors"
                    >
                      <div className="flex items-center justify-between gap-2 mb-1.5">
                        <p className="text-sm font-semibold truncate flex items-center gap-2 min-w-0">
                          <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: g.color }} />
                          <span className="truncate">{g.name}</span>
                        </p>
                        <span className="text-xs font-semibold tabular-nums shrink-0">{Math.round(pct)}%</span>
                      </div>
                      <div className="h-1.5 bg-gray-100 dark:bg-gray-800 rounded-full overflow-hidden">
                        <div className="h-full rounded-full" style={{ width: `${pct}%`, backgroundColor: g.color }} />
                      </div>
                      <div className="mt-2 flex items-center justify-between text-xs text-gray-500 dark:text-gray-400">
                        <span>{formatCurrency(remaining)} to go</span>
                        {monthly !== null && monthly > 0 && (
                          <span className="font-medium text-gray-700 dark:text-gray-300 tabular-nums">
                            {formatCurrency(monthly)}/mo
                          </span>
                        )}
                      </div>
                    </Link>
                  );
                })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Accounts + Recurring */}
      <div className="grid md:grid-cols-2 gap-6">
        <Card className="border-0 ring-1 ring-gray-200 dark:ring-gray-800/80">
          <CardHeader>
            <CardTitle className="text-base">Accounts</CardTitle>
          </CardHeader>
          <CardContent>
            {filteredAccounts.length === 0 ? (
              <p className="text-sm text-gray-400 dark:text-gray-500">
                No accounts. <Link href="/accounts" className="text-blue-600 hover:underline">Add one</Link>
              </p>
            ) : (
              <div className="space-y-2.5">
                {(() => {
                  const assets = filteredAccounts
                    .filter((a) => a.type !== "CREDIT_CARD")
                    .reduce((s, a) => s + a.computedBalance, 0);
                  const liabilities = filteredAccounts
                    .filter((a) => a.type === "CREDIT_CARD")
                    .reduce((s, a) => s + Math.max(-a.computedBalance, 0), 0);
                  const net = assets - liabilities;
                  if (assets === 0 && liabilities === 0) return null;
                  return (
                    <div className="grid grid-cols-3 gap-2 pb-3 mb-1 border-b border-gray-100 dark:border-gray-800">
                      <div>
                        <p className="text-[10px] uppercase tracking-wide text-gray-400 dark:text-gray-500">Assets</p>
                        <p className="text-sm font-semibold text-emerald-600 dark:text-emerald-400 tabular-nums">
                          {formatCurrency(assets)}
                        </p>
                      </div>
                      <div>
                        <p className="text-[10px] uppercase tracking-wide text-gray-400 dark:text-gray-500">Debt</p>
                        <p className={`text-sm font-semibold tabular-nums ${liabilities > 0 ? "text-rose-600" : "text-gray-400 dark:text-gray-500"}`}>
                          {liabilities > 0 ? `-${formatCurrency(liabilities)}` : formatCurrency(0)}
                        </p>
                      </div>
                      <div>
                        <p className="text-[10px] uppercase tracking-wide text-gray-400 dark:text-gray-500">Net worth</p>
                        <p className="text-sm font-semibold text-gray-900 dark:text-gray-100 tabular-nums">
                          {formatCurrency(net)}
                        </p>
                      </div>
                    </div>
                  );
                })()}
                {filteredAccounts.map((acc) => {
                  const isCredit = acc.type === "CREDIT_CARD";
                  const balance = isCredit ? -acc.computedBalance : acc.computedBalance;
                  return (
                    <div key={acc.id} className="flex items-center justify-between py-1.5 border-b border-gray-50 last:border-0">
                      <div className="min-w-0">
                        <p className="text-sm font-medium truncate">
                          {acc.name}
                          {acc.isJoint && <span className="ml-1.5 text-xs text-purple-600 font-normal">(Joint)</span>}
                          {acc.owner === "partner" && <span className="ml-1.5 text-xs text-blue-500 font-normal">(Partner)</span>}
                        </p>
                        <p className="text-xs text-gray-400 dark:text-gray-500">{acc.type.replace("_", " ")}</p>
                      </div>
                      <span className={`text-sm font-semibold shrink-0 ml-2 ${isCredit && balance > 0 ? "text-red-600" : "text-gray-900 dark:text-gray-100"}`}>
                        {formatCurrency(balance)}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="border-0 ring-1 ring-gray-200 dark:ring-gray-800/80">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Repeat className="w-4 h-4" /> Recurring Spend
            </CardTitle>
          </CardHeader>
          <CardContent>
            {insights.recurring.length === 0 ? (
              <p className="text-sm text-gray-400 dark:text-gray-500">Not enough data yet to detect recurring transactions</p>
            ) : (
              <div className="space-y-2">
                {insights.recurring.slice(0, 8).map((r) => (
                  <div key={r.name} className="flex items-center justify-between py-1">
                    <div className="flex items-center gap-2 min-w-0">
                      <p className="text-sm truncate">{r.name}</p>
                      <Badge variant="secondary" className="text-[10px] h-4 shrink-0">{r.months}mo</Badge>
                    </div>
                    <span className="text-sm font-medium ml-3 shrink-0">{formatCurrency(r.amount)}</span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Bar chart — click a bar to jump to that month's transactions */}
      {monthlySpendingData.length > 0 && (
        <Card className="border-0 ring-1 ring-gray-200 dark:ring-gray-800/80">
          <CardHeader>
            <CardTitle className="text-base">Monthly Totals (6 months)</CardTitle>
            <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">Click a bar to view that month, or jump to Compare to put two months side by side.</p>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={180}>
              <BarChart data={monthlySpendingData}>
                <XAxis dataKey="month" tick={{ fontSize: 11 }} stroke="#9ca3af" />
                <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`} stroke="#9ca3af" />
                <Tooltip formatter={(v) => formatCurrency(Number(v ?? 0))} />
                <Bar
                  dataKey="total"
                  fill="#6366F1"
                  radius={[6, 6, 0, 0]}
                  style={{ cursor: "pointer" }}
                  onClick={(data) => {
                    const key = (data as { key?: string }).key;
                    if (key) jumpToMonth(key);
                  }}
                />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
