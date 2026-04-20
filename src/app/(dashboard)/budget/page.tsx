"use client";

import { useEffect, useState } from "react";
import { format, getDaysInMonth, getDate } from "date-fns";
import { TrendingUp, TrendingDown, Minus, Settings2, ChevronRight } from "lucide-react";
import Link from "next/link";
import { cn } from "@/lib/utils";

interface BudgetItem {
  category: string;
  color: string;
  spent: number;
  budget: number;
  baseBudget: number;
  rolloverAmount: number;
  remaining: number;
  pct: number;
}

interface InsightsData {
  budgetUtilization: BudgetItem[];
  thisMonthTotal: number;
}

interface Category {
  id: string;
  name: string;
  color: string;
  monthlyBudget: number | null;
}

function formatCurrency(n: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(n);
}

function PaceChip({ spentPct, daysPct }: { spentPct: number; daysPct: number }) {
  const diff = spentPct - daysPct;
  if (spentPct >= 100) return (
    <span className="text-xs font-medium text-red-600 dark:text-red-400 flex items-center gap-0.5">
      <TrendingUp className="w-3 h-3" /> Over budget
    </span>
  );
  if (diff > 10) return (
    <span className="text-xs font-medium text-amber-600 dark:text-amber-400 flex items-center gap-0.5">
      <TrendingUp className="w-3 h-3" /> Ahead of pace
    </span>
  );
  if (diff < -15) return (
    <span className="text-xs font-medium text-emerald-600 dark:text-emerald-400 flex items-center gap-0.5">
      <TrendingDown className="w-3 h-3" /> Under pace
    </span>
  );
  return (
    <span className="text-xs font-medium text-gray-400 dark:text-gray-500 flex items-center gap-0.5">
      <Minus className="w-3 h-3" /> On track
    </span>
  );
}

export default function BudgetPage() {
  const [data, setData] = useState<InsightsData | null>(null);
  const [allCategories, setAllCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);

  const now = new Date();
  const daysInMonth = getDaysInMonth(now);
  const daysPassed = getDate(now);
  const daysPct = (daysPassed / daysInMonth) * 100;
  const daysLeft = daysInMonth - daysPassed;
  const monthLabel = format(now, "MMMM yyyy");

  useEffect(() => {
    Promise.all([
      fetch("/api/insights").then((r) => r.json()),
      fetch("/api/categories").then((r) => r.json()),
    ]).then(([insights, cats]) => {
      setData(insights);
      setAllCategories(cats);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, []);

  if (loading) return (
    <div className="max-w-2xl mx-auto space-y-4 animate-pulse">
      {[...Array(5)].map((_, i) => (
        <div key={i} className="h-20 bg-gray-100 dark:bg-gray-800 rounded-xl" />
      ))}
    </div>
  );

  const budgets = data?.budgetUtilization ?? [];
  const totalBudget = budgets.reduce((s, b) => s + b.budget, 0);
  const totalSpent = budgets.reduce((s, b) => s + b.spent, 0);
  const totalRemaining = totalBudget - totalSpent;
  const totalPct = totalBudget > 0 ? Math.min((totalSpent / totalBudget) * 100, 100) : 0;
  const overBudget = totalRemaining < 0;

  const budgetedNames = new Set(budgets.map((b) => b.category));
  const unbudgeted = allCategories.filter((c) => !budgetedNames.has(c.name) && c.monthlyBudget === null);

  // Daily rate: on pace = spending totalBudget/daysInMonth per day
  const dailyTarget = totalBudget / daysInMonth;
  const dailyActual = daysPassed > 0 ? totalSpent / daysPassed : 0;

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Budget</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">{monthLabel}</p>
        </div>
        <Link href="/categories" className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-900 dark:hover:text-gray-100 transition-colors">
          <Settings2 className="w-4 h-4" /> Edit budgets
        </Link>
      </div>

      {budgets.length === 0 ? (
        <div className="rounded-xl border border-dashed border-gray-200 dark:border-gray-700 p-10 text-center">
          <p className="text-gray-500 dark:text-gray-400 text-sm">No budgets set yet.</p>
          <Link href="/categories" className="mt-3 inline-flex items-center gap-1 text-sm font-medium text-indigo-600 dark:text-indigo-400 hover:underline">
            Set budgets on your categories <ChevronRight className="w-3.5 h-3.5" />
          </Link>
        </div>
      ) : (
        <>
          {/* Summary card */}
          <div className="rounded-xl bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 p-5 space-y-4">
            <div className="flex items-end justify-between">
              <div>
                <p className="text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wide font-medium">Total budget</p>
                <p className="text-3xl font-bold text-gray-900 dark:text-gray-100 mt-0.5">{formatCurrency(totalBudget)}</p>
              </div>
              <div className="text-right">
                <p className={cn("text-xl font-bold", overBudget ? "text-red-600" : "text-emerald-600")}>
                  {overBudget ? `${formatCurrency(Math.abs(totalRemaining))} over` : `${formatCurrency(totalRemaining)} left`}
                </p>
                <p className="text-xs text-gray-400 dark:text-gray-500">{formatCurrency(totalSpent)} spent · {Math.round(totalPct)}%</p>
              </div>
            </div>

            {/* Total progress bar */}
            <div className="h-2.5 bg-gray-100 dark:bg-gray-800 rounded-full overflow-hidden">
              <div
                className={cn("h-full rounded-full transition-all", overBudget ? "bg-red-500" : totalPct > 80 ? "bg-amber-500" : "bg-emerald-500")}
                style={{ width: `${Math.min(totalPct, 100)}%` }}
              />
            </div>

            {/* Pacing row */}
            <div className="flex items-center justify-between text-xs text-gray-500 dark:text-gray-400">
              <span>Day {daysPassed} of {daysInMonth} · {daysLeft} days left</span>
              <div className="flex items-center gap-3">
                <span>Daily target {formatCurrency(dailyTarget)}</span>
                <span className={cn("font-medium", dailyActual > dailyTarget * 1.1 ? "text-red-600" : dailyActual < dailyTarget * 0.9 ? "text-emerald-600" : "text-gray-600 dark:text-gray-300")}>
                  Actual {formatCurrency(dailyActual)}/day
                </span>
              </div>
            </div>

            {/* Day progress indicator */}
            <div className="relative h-1 bg-gray-100 dark:bg-gray-800 rounded-full">
              <div className="h-full bg-gray-300 dark:bg-gray-600 rounded-full" style={{ width: `${daysPct}%` }} />
              <div
                className="absolute top-1/2 -translate-y-1/2 w-2 h-2 rounded-full bg-gray-500 border-2 border-white dark:border-gray-900"
                style={{ left: `${daysPct}%` }}
              />
            </div>
            <p className="text-xs text-gray-400 dark:text-gray-500 -mt-2">{Math.round(daysPct)}% through the month</p>
          </div>

          {/* Per-category list */}
          <div className="space-y-3">
            {budgets.map((b) => {
              const pct = Math.min(Math.max(b.pct, 0), 100);
              const over = b.remaining < 0;
              const barColor = over ? "bg-red-500" : b.pct > daysPct + 10 ? "bg-amber-500" : "bg-emerald-500";

              return (
                <div key={b.category} className="rounded-xl bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2.5">
                      <div className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: b.color }} />
                      <span className="font-medium text-gray-900 dark:text-gray-100 text-sm">{b.category}</span>
                      {b.rolloverAmount > 0 && (
                        <span className="text-xs text-indigo-500 bg-indigo-50 dark:bg-indigo-950 px-1.5 py-0.5 rounded-full">
                          +{formatCurrency(b.rolloverAmount)} rollover
                        </span>
                      )}
                    </div>
                    <PaceChip spentPct={b.pct} daysPct={daysPct} />
                  </div>

                  <div className="h-2 bg-gray-100 dark:bg-gray-800 rounded-full overflow-hidden">
                    <div className={cn("h-full rounded-full transition-all", barColor)} style={{ width: `${pct}%` }} />
                  </div>

                  <div className="flex items-center justify-between text-xs text-gray-500 dark:text-gray-400">
                    <span>{formatCurrency(b.spent)} spent</span>
                    <span className={cn("font-medium", over ? "text-red-600 dark:text-red-400" : "text-gray-700 dark:text-gray-300")}>
                      {over ? `${formatCurrency(Math.abs(b.remaining))} over` : `${formatCurrency(b.remaining)} left`}
                      <span className="font-normal text-gray-400 dark:text-gray-500 ml-1">of {formatCurrency(b.budget)}</span>
                    </span>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Unbudgeted categories */}
          {unbudgeted.length > 0 && (
            <div className="rounded-xl border border-dashed border-gray-200 dark:border-gray-700 p-4">
              <p className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-3">No budget set</p>
              <div className="flex flex-wrap gap-2">
                {unbudgeted.map((c) => (
                  <Link key={c.id} href="/categories" className="flex items-center gap-1.5 text-xs text-gray-600 dark:text-gray-300 bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 px-2.5 py-1 rounded-full transition-colors">
                    <div className="w-2 h-2 rounded-full" style={{ backgroundColor: c.color }} />
                    {c.name}
                  </Link>
                ))}
              </div>
              <Link href="/categories" className="mt-3 inline-flex items-center gap-1 text-xs text-indigo-600 dark:text-indigo-400 hover:underline">
                Set budgets <ChevronRight className="w-3 h-3" />
              </Link>
            </div>
          )}
        </>
      )}
    </div>
  );
}
