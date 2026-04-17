"use client";

import { useState, useEffect } from "react";
import { format } from "date-fns";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  LineChart, Line, Legend, Cell
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { AlertTriangle, Repeat, TrendingUp, CreditCard } from "lucide-react";

interface InsightData {
  monthlyByCategory: Record<string, Record<string, number>>;
  monthlyTotals: Record<string, number>;
  thisMonthTotal: number;
  lastMonthTotal: number;
  momChange: number;
  topCategories: [string, number][];
  recurring: Array<{ name: string; amount: number; months: number }>;
  anomalies: Array<{ category: string; thisMonth: number; average: number; ratio: number }>;
  incomeVsSpending: Array<{ month: string; income: number; spending: number; net: number }>;
  subscriptions: Array<{
    merchant: string;
    amount: number;
    categoryId: string | null;
    categoryName: string | null;
    lastDate: string;
    monthlyCount: number;
  }>;
}

function formatCurrency(n: number) {
  return new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP" }).format(n);
}

function formatMonth(key: string) {
  const [year, month] = key.split("-");
  return format(new Date(parseInt(year), parseInt(month) - 1, 1), "MMM yy");
}

const CAT_COLORS = [
  "#3B82F6", "#22C55E", "#F97316", "#8B5CF6", "#EC4899",
  "#F59E0B", "#10B981", "#EF4444", "#6366F1", "#14B8A6",
];

export default function InsightsPage() {
  const [insights, setInsights] = useState<InsightData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/insights?months=6").then((r) => r.json()).then((data) => {
      setInsights(data);
      setLoading(false);
    });
  }, []);

  if (loading) return <div className="text-center py-12 text-gray-400">Crunching numbers...</div>;
  if (!insights) return null;

  // Build stacked bar data for spending by category by month
  const allCategories = new Set<string>();
  Object.values(insights.monthlyByCategory).forEach((cats) =>
    Object.keys(cats).forEach((c) => allCategories.add(c))
  );
  const catList = Array.from(allCategories).slice(0, 8);

  const stackedData = Object.entries(insights.monthlyByCategory)
    .sort(([a], [b]) => a.localeCompare(b))
    .slice(-6)
    .map(([month, cats]) => ({
      month: formatMonth(month),
      ...Object.fromEntries(catList.map((c) => [c, cats[c] ?? 0])),
    }));

  const incomeData = insights.incomeVsSpending.slice(-6).map((d) => ({
    ...d,
    month: formatMonth(d.month),
  }));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Insights</h1>
        <p className="text-sm text-gray-500 mt-1">Patterns, anomalies, and trends in your spending</p>
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
              <div key={a.category} className="flex items-center justify-between bg-white rounded-lg p-3 border border-amber-100">
                <div>
                  <p className="font-medium text-gray-900">{a.category}</p>
                  <p className="text-xs text-gray-500">
                    Average: {formatCurrency(a.average)}/month
                  </p>
                </div>
                <div className="text-right">
                  <p className="font-bold text-amber-700">{formatCurrency(a.thisMonth)}</p>
                  <Badge variant="destructive" className="text-xs">{a.ratio.toFixed(1)}× usual</Badge>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Spending by category stacked bars */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <TrendingUp className="w-4 h-4" />
            Spending by Category (6 months)
          </CardTitle>
        </CardHeader>
        <CardContent>
          {stackedData.length === 0 ? (
            <p className="text-sm text-gray-400 py-8 text-center">No data yet</p>
          ) : (
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={stackedData}>
                <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `£${(v / 1000).toFixed(0)}k`} />
                <Tooltip formatter={(v) => formatCurrency(Number(v ?? 0))} />
                <Legend />
                {catList.map((cat, i) => (
                  <Bar key={cat} dataKey={cat} stackId="a" fill={CAT_COLORS[i % CAT_COLORS.length]} />
                ))}
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
            <p className="text-sm text-gray-400 py-8 text-center">No data yet</p>
          ) : (
            <ResponsiveContainer width="100%" height={240}>
              <LineChart data={incomeData}>
                <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `£${(v / 1000).toFixed(0)}k`} />
                <Tooltip formatter={(v) => formatCurrency(Number(v ?? 0))} />
                <Legend />
                <Line type="monotone" dataKey="income" stroke="#22C55E" strokeWidth={2} dot name="Income" />
                <Line type="monotone" dataKey="spending" stroke="#EF4444" strokeWidth={2} dot name="Spending" />
                <Line type="monotone" dataKey="net" stroke="#3B82F6" strokeWidth={2} strokeDasharray="4 2" dot={false} name="Net saved" />
              </LineChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>

      {/* Recurring transactions */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Repeat className="w-4 h-4" />
            Recurring Transactions
          </CardTitle>
        </CardHeader>
        <CardContent>
          {insights.recurring.length === 0 ? (
            <p className="text-sm text-gray-400">Upload several months of statements to detect recurring transactions</p>
          ) : (
            <div className="space-y-1">
              <p className="text-xs text-gray-400 mb-3">
                Transactions appearing at a similar amount across multiple months
              </p>
              <div className="divide-y divide-gray-50">
                {insights.recurring.map((r) => (
                  <div key={r.name} className="flex items-center justify-between py-3">
                    <div>
                      <p className="text-sm font-medium">{r.name}</p>
                      <p className="text-xs text-gray-400">Seen in {r.months} months</p>
                    </div>
                    <p className="text-sm font-semibold">{formatCurrency(r.amount)}/month</p>
                  </div>
                ))}
              </div>
              <div className="pt-3 border-t border-gray-100 mt-2">
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500 font-medium">Estimated recurring total</span>
                  <span className="font-bold">{formatCurrency(insights.recurring.reduce((s, r) => s + r.amount, 0))}/month</span>
                </div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Subscriptions */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <CreditCard className="w-4 h-4" />
            Subscriptions
          </CardTitle>
        </CardHeader>
        <CardContent>
          {!insights.subscriptions || insights.subscriptions.length === 0 ? (
            <p className="text-sm text-gray-400">
              No recurring subscriptions detected yet. Upload more statements to detect patterns.
            </p>
          ) : (
            <div className="space-y-2">
              <div className="grid grid-cols-[1fr_auto_auto_auto_auto] gap-x-4 text-xs text-gray-400 uppercase tracking-wide pb-2 border-b border-gray-100">
                <span>Merchant</span>
                <span className="text-right">Monthly</span>
                <span className="text-right">Category</span>
                <span className="text-right">Last charged</span>
                <span className="text-right">Annual cost</span>
              </div>
              <div className="divide-y divide-gray-50">
                {insights.subscriptions.map((sub) => (
                  <div key={sub.merchant} className="grid grid-cols-[1fr_auto_auto_auto_auto] gap-x-4 py-3 items-center text-sm">
                    <div>
                      <p className="font-medium text-gray-900">{sub.merchant}</p>
                      <p className="text-xs text-gray-400">{sub.monthlyCount} months detected</p>
                    </div>
                    <span className="text-right font-medium">{formatCurrency(sub.amount)}</span>
                    <span className="text-right text-gray-500 text-xs">
                      {sub.categoryName ?? <span className="text-gray-300">—</span>}
                    </span>
                    <span className="text-right text-gray-400 text-xs whitespace-nowrap">
                      {format(new Date(sub.lastDate), "dd MMM yy")}
                    </span>
                    <span className="text-right font-semibold text-gray-700">
                      {formatCurrency(sub.amount * 12)}
                    </span>
                  </div>
                ))}
              </div>
              <div className="pt-3 border-t border-gray-100 flex justify-between text-sm font-semibold">
                <span className="text-gray-600">Total annual subscriptions</span>
                <span>{formatCurrency(insights.subscriptions.reduce((s, sub) => s + sub.amount * 12, 0))}</span>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Top categories this month */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Top Spending Categories This Month</CardTitle>
        </CardHeader>
        <CardContent>
          {insights.topCategories.length === 0 ? (
            <p className="text-sm text-gray-400">No data this month</p>
          ) : (
            <div className="space-y-3">
              {insights.topCategories.map(([cat, amount], i) => (
                <div key={cat} className="flex items-center gap-3">
                  <span className="w-5 text-xs text-gray-400 font-medium text-right">{i + 1}</span>
                  <div
                    className="h-2 rounded-full flex-1 min-w-0"
                    style={{
                      backgroundColor: CAT_COLORS[i % CAT_COLORS.length],
                      width: `${(amount / (insights.topCategories[0]?.[1] ?? 1)) * 100}%`,
                      maxWidth: "100%",
                    }}
                  />
                  <span className="text-sm font-medium w-28 text-right">{formatCurrency(amount)}</span>
                  <span className="text-sm text-gray-500 w-28 truncate">{cat}</span>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
