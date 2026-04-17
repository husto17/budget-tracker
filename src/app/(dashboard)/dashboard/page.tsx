"use client";

import { useState, useEffect } from "react";
import { format } from "date-fns";
import {
  BarChart, Bar, PieChart, Pie, Cell, LineChart, Line,
  XAxis, YAxis, Tooltip, ResponsiveContainer, Legend
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { TrendingUp, TrendingDown, AlertTriangle, Repeat, ArrowRightLeft } from "lucide-react";

interface InsightData {
  monthlyTotals: Record<string, number>;
  monthlyByCategory: Record<string, Record<string, number>>;
  thisMonthTotal: number;
  lastMonthTotal: number;
  momChange: number;
  topCategories: [string, number][];
  recurring: Array<{ name: string; amount: number; months: number }>;
  anomalies: Array<{ category: string; thisMonth: number; average: number; ratio: number }>;
  budgetUtilization: Array<{ category: string; color: string; spent: number; budget: number; remaining: number; pct: number }>;
  incomeVsSpending: Array<{ month: string; income: number; spending: number; net: number }>;
}

interface Account {
  id: string;
  name: string;
  type: string;
  isJoint: boolean;
  owner: "me" | "partner";
  computedBalance: number;
}

function formatCurrency(n: number) {
  return new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP" }).format(n);
}

function formatMonth(key: string) {
  const [year, month] = key.split("-");
  return format(new Date(parseInt(year), parseInt(month) - 1, 1), "MMM yy");
}

const CHART_COLORS = [
  "#3B82F6", "#22C55E", "#F97316", "#8B5CF6", "#EC4899",
  "#F59E0B", "#10B981", "#EF4444", "#6366F1", "#14B8A6",
];

type ViewFilter = "all" | "mine" | "partner" | "joint";

export default function DashboardPage() {
  const [insights, setInsights] = useState<InsightData | null>(null);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [loading, setLoading] = useState(true);
  const [viewFilter, setViewFilter] = useState<ViewFilter>("all");

  useEffect(() => {
    Promise.all([
      fetch("/api/insights").then((r) => r.json()),
      fetch("/api/accounts").then((r) => r.json()),
    ]).then(([ins, accs]) => {
      setInsights(ins);
      setAccounts(accs);
      setLoading(false);
    });
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64 text-gray-400">
        Loading dashboard...
      </div>
    );
  }

  if (!insights) return null;

  const thisMonth = format(new Date(), "MMMM yyyy");

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
    .map(([month, total]) => ({ month: formatMonth(month), total }));

  const pieData = insights.topCategories
    .slice(0, 6)
    .map(([name, value]) => ({ name, value }));

  const incomeSpendingData = insights.incomeVsSpending
    .slice(-6)
    .map((d) => ({ ...d, month: formatMonth(d.month) }));

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
          <p className="text-sm text-gray-500 mt-1">{thisMonth}</p>
        </div>
        {hasPartner && (
          <div className="flex gap-1 bg-gray-100 rounded-lg p-1">
            {(["all", "mine", "partner", "joint"] as ViewFilter[]).map((f) => (
              <button
                key={f}
                onClick={() => setViewFilter(f)}
                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors capitalize ${
                  viewFilter === f
                    ? "bg-white text-gray-900 shadow-sm"
                    : "text-gray-500 hover:text-gray-700"
                }`}
              >
                {f === "all" ? "All" : f === "mine" ? "Mine" : f === "partner" ? "Partner's" : "Joint"}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Top stat cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card className="bg-gradient-to-br from-blue-600 to-blue-700 text-white border-0">
          <CardContent className="pt-5 pb-4">
            <p className="text-blue-100 text-xs font-medium">Net Balance</p>
            <p className="text-2xl font-bold mt-1">{formatCurrency(netBalance)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-5 pb-4">
            <p className="text-gray-400 text-xs font-medium">This Month Spent</p>
            <p className="text-2xl font-bold mt-1">{formatCurrency(insights.thisMonthTotal)}</p>
            <div className={`flex items-center gap-1 mt-1 text-xs ${insights.momChange > 0 ? "text-red-500" : "text-green-500"}`}>
              {insights.momChange > 0 ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
              {Math.abs(insights.momChange).toFixed(1)}% vs last month
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-5 pb-4">
            <p className="text-gray-400 text-xs font-medium">Last Month Spent</p>
            <p className="text-2xl font-bold mt-1">{formatCurrency(insights.lastMonthTotal)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-5 pb-4">
            <p className="text-gray-400 text-xs font-medium">Recurring / month</p>
            <p className="text-2xl font-bold mt-1">
              {formatCurrency(insights.recurring.reduce((s, r) => s + r.amount, 0))}
            </p>
            <p className="text-xs text-gray-400 mt-1">{insights.recurring.length} subscriptions detected</p>
          </CardContent>
        </Card>
      </div>

      {/* Anomaly alerts */}
      {insights.anomalies.length > 0 && (
        <div className="space-y-2">
          {insights.anomalies.map((a) => (
            <div key={a.category} className="flex items-center gap-3 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3">
              <AlertTriangle className="w-4 h-4 text-amber-500 flex-shrink-0" />
              <p className="text-sm text-amber-700">
                <strong>{a.category}</strong> spending is {formatCurrency(a.thisMonth)} this month —{" "}
                {a.ratio.toFixed(1)}× your usual average of {formatCurrency(a.average)}.
              </p>
            </div>
          ))}
        </div>
      )}

      <div className="grid md:grid-cols-2 gap-6">
        {/* Monthly spending trend */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Monthly Spending</CardTitle>
          </CardHeader>
          <CardContent>
            {monthlySpendingData.length === 0 ? (
              <p className="text-sm text-gray-400 py-8 text-center">No data yet — upload a statement to get started</p>
            ) : (
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={monthlySpendingData}>
                  <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `£${(v / 1000).toFixed(0)}k`} />
                  <Tooltip formatter={(v) => formatCurrency(Number(v ?? 0))} />
                  <Bar dataKey="total" fill="#3B82F6" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        {/* Spending by category pie */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Spending This Month</CardTitle>
          </CardHeader>
          <CardContent>
            {pieData.length === 0 ? (
              <p className="text-sm text-gray-400 py-8 text-center">No categorized transactions this month</p>
            ) : (
              <ResponsiveContainer width="100%" height={200}>
                <PieChart>
                  <Pie data={pieData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={80} label={false}>
                    {pieData.map((_, i) => (
                      <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(v) => formatCurrency(Number(v ?? 0))} />
                </PieChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Income vs spending */}
      {incomeSpendingData.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Income vs Spending</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={220}>
              <LineChart data={incomeSpendingData}>
                <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `£${(v / 1000).toFixed(0)}k`} />
                <Tooltip formatter={(v) => formatCurrency(Number(v ?? 0))} />
                <Legend />
                <Line type="monotone" dataKey="income" stroke="#22C55E" strokeWidth={2} dot={false} name="Income" />
                <Line type="monotone" dataKey="spending" stroke="#EF4444" strokeWidth={2} dot={false} name="Spending" />
                <Line type="monotone" dataKey="net" stroke="#3B82F6" strokeWidth={2} strokeDasharray="4 2" dot={false} name="Net" />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}

      {/* Budget utilization */}
      {insights.budgetUtilization.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Budget Tracking — {thisMonth}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {insights.budgetUtilization.map((b) => (
                <div key={b.category}>
                  <div className="flex items-center justify-between mb-1.5">
                    <div className="flex items-center gap-2">
                      <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: b.color }} />
                      <span className="text-sm font-medium">{b.category}</span>
                    </div>
                    <div className="flex items-center gap-2 text-sm">
                      <span className={b.remaining < 0 ? "text-red-600 font-medium" : "text-gray-500"}>
                        {b.remaining < 0 ? `Over by ${formatCurrency(Math.abs(b.remaining))}` : `${formatCurrency(b.remaining)} left`}
                      </span>
                      <span className="text-gray-300">|</span>
                      <span className="text-gray-400 text-xs">{formatCurrency(b.spent)} / {formatCurrency(b.budget)}</span>
                    </div>
                  </div>
                  <Progress
                    value={b.pct}
                    className="h-2"
                    style={{ "--progress-color": b.pct >= 100 ? "#EF4444" : b.color } as React.CSSProperties}
                  />
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      <div className="grid md:grid-cols-2 gap-6">
        {/* Accounts summary */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Accounts</CardTitle>
          </CardHeader>
          <CardContent>
            {filteredAccounts.length === 0 ? (
              <p className="text-sm text-gray-400">No accounts. <a href="/accounts" className="text-blue-600 hover:underline">Add one</a></p>
            ) : (
              <div className="space-y-3">
                {filteredAccounts.map((acc) => {
                  const isCredit = acc.type === "CREDIT_CARD";
                  const balance = isCredit ? -acc.computedBalance : acc.computedBalance;
                  return (
                    <div key={acc.id} className="flex items-center justify-between py-2 border-b border-gray-50 last:border-0">
                      <div>
                        <p className="text-sm font-medium">
                          {acc.name}
                          {acc.isJoint && <span className="ml-1.5 text-xs text-purple-600 font-normal">(Joint)</span>}
                          {acc.owner === "partner" && <span className="ml-1.5 text-xs text-blue-500 font-normal">(Partner)</span>}
                        </p>
                        <p className="text-xs text-gray-400">{acc.type.replace("_", " ")}</p>
                      </div>
                      <span className={`text-sm font-semibold ${isCredit && balance > 0 ? "text-red-600" : "text-gray-900"}`}>
                        {formatCurrency(balance)}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Recurring subscriptions */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Repeat className="w-4 h-4" />
              Recurring Spend
            </CardTitle>
          </CardHeader>
          <CardContent>
            {insights.recurring.length === 0 ? (
              <p className="text-sm text-gray-400">Not enough data yet to detect recurring transactions</p>
            ) : (
              <div className="space-y-2">
                {insights.recurring.slice(0, 8).map((r) => (
                  <div key={r.name} className="flex items-center justify-between py-1">
                    <div className="flex items-center gap-2 min-w-0">
                      <ArrowRightLeft className="w-3.5 h-3.5 text-gray-300 flex-shrink-0" />
                      <p className="text-sm truncate">{r.name}</p>
                      <Badge variant="secondary" className="text-xs shrink-0">{r.months} months</Badge>
                    </div>
                    <span className="text-sm font-medium ml-3 shrink-0">{formatCurrency(r.amount)}</span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
