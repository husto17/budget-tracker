"use client";

import { useState, useEffect } from "react";
import { format, parseISO, isToday, isThisMonth } from "date-fns";
import { ChevronLeft, ChevronRight, TrendingDown, TrendingUp, X } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { fetchJson, formatCurrency } from "@/lib/fetcher";
import { Skeleton } from "@/components/ui/skeleton";
import Link from "next/link";
import type { CashFlowDay, CashFlowEvent } from "@/app/api/cashflow/route";

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function eventColor(ev: CashFlowEvent): string {
  if (ev.type === "income") return "bg-emerald-100 text-emerald-700 border-emerald-200";
  if (ev.type === "credit") return "bg-emerald-50 text-emerald-600 border-emerald-100";
  if (ev.type === "bill") return "bg-red-100 text-red-700 border-red-200";
  if (ev.type === "category-estimate") return "bg-indigo-50 text-indigo-600 border-indigo-200 border-dashed";
  return "bg-gray-100 text-gray-600 border-gray-200";
}

function EventChip({ ev, onDismiss }: { ev: CashFlowEvent; onDismiss?: () => void }) {
  const cls = eventColor(ev);
  const isCatEstimate = ev.type === "category-estimate";
  const href = isCatEstimate
    ? `/transactions?categoryName=${encodeURIComponent(ev.label)}`
    : `/transactions?search=${encodeURIComponent(ev.label)}`;
  const prefix = ev.type === "income" || ev.type === "credit" ? "+" : isCatEstimate ? "~" : "−";
  return (
    <div className="flex items-center gap-0.5 group/chip">
      <Link
        href={href}
        className={`flex-1 truncate text-[9px] font-medium px-1 py-0.5 rounded border ${cls} hover:opacity-80 transition-opacity`}
        title={`${ev.label} — ${ev.isProjected ? "projected " : ""}${formatCurrency(ev.amount)}`}
        onClick={(e) => e.stopPropagation()}
      >
        {prefix}{formatCurrency(ev.amount)} {ev.label}
      </Link>
      {onDismiss && (
        <button
          onClick={(e) => { e.stopPropagation(); onDismiss(); }}
          className="opacity-0 group-hover/chip:opacity-100 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition-opacity"
          title={`Dismiss ${ev.label} projection`}
        >
          <X className="w-2.5 h-2.5" />
        </button>
      )}
    </div>
  );
}

export default function CashFlowPage() {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [days, setDays] = useState<CashFlowDay[]>([]);
  const [currentBalance, setCurrentBalance] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [dismissedProjections, setDismissedProjections] = useState<Set<string>>(() => {
    if (typeof window === "undefined") return new Set();
    try {
      const saved = JSON.parse(localStorage.getItem("cashflow:dismissed") ?? "[]");
      return new Set(Array.isArray(saved) ? saved : []);
    } catch { return new Set(); }
  });
  const [dismissedPaydays, setDismissedPaydays] = useState<Set<number>>(() => {
    if (typeof window === "undefined") return new Set();
    try {
      const saved = JSON.parse(localStorage.getItem("cashflow:dismissed-paydays") ?? "[]");
      return new Set(Array.isArray(saved) ? saved : []);
    } catch { return new Set(); }
  });

  function dismissProjection(label: string) {
    setDismissedProjections((prev) => {
      const next = new Set(prev);
      next.add(label);
      try { localStorage.setItem("cashflow:dismissed", JSON.stringify(Array.from(next))); } catch {}
      return next;
    });
  }

  function restoreProjections() {
    setDismissedProjections(new Set());
    setDismissedPaydays(new Set());
    try { localStorage.removeItem("cashflow:dismissed"); localStorage.removeItem("cashflow:dismissed-paydays"); } catch {}
  }

  useEffect(() => {
    setLoading(true);
    const cfParams = new URLSearchParams({ year: String(year), month: String(month) });
    if (dismissedPaydays.size > 0) cfParams.set("excludePaydays", Array.from(dismissedPaydays).join(","));
    fetchJson<{ days: CashFlowDay[]; currentBalance: number }>(
      `/api/cashflow?${cfParams}`
    )
      .then(({ days, currentBalance }) => {
        setDays(days);
        setCurrentBalance(currentBalance);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [year, month, dismissedPaydays]);

  function prevMonth() {
    if (month === 1) { setYear(y => y - 1); setMonth(12); }
    else setMonth(m => m - 1);
  }
  function nextMonth() {
    if (month === 12) { setYear(y => y + 1); setMonth(1); }
    else setMonth(m => m + 1);
  }

  const title = format(new Date(year, month - 1, 1), "MMMM yyyy");

  // Find min/max balance for heat-map scaling
  const balances = days.filter(d => d.date.startsWith(`${year}-${String(month).padStart(2, "0")}`)).map(d => d.balance);
  const minBal = balances.length ? Math.min(...balances) : 0;
  const maxBal = balances.length ? Math.max(...balances) : 1;

  // Upcoming events (future days in view with events)
  const todayStr = now.toISOString().slice(0, 10);

  function filterEvents(events: CashFlowEvent[]) {
    return events.map(ev =>
      ev.isProjected && dismissedProjections.has(ev.label) ? null : ev
    ).filter((ev): ev is CashFlowEvent => ev !== null);
  }

  const upcoming = days
    .filter(d => d.date > todayStr && d.events.length > 0)
    .flatMap(d => d.events.map(ev => ({ ...ev, date: d.date })))
    .filter(ev => ev.isProjected && !dismissedProjections.has(ev.label))
    .slice(0, 12);

  // Summary: projected net for month (excluding dismissed)
  const projectedNet = days
    .filter(d => d.date.startsWith(`${year}-${String(month).padStart(2, "0")}`))
    .flatMap(d => d.events.filter(e => e.isProjected && !dismissedProjections.has(e.label)))
    .reduce((s, e) => s + (e.type === "income" ? e.amount : -e.amount), 0);

  return (
    <div className="space-y-6 max-w-5xl">
      {/* Header */}
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Cash Flow Calendar</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
            Actual spending + projected bills and income
          </p>
        </div>
        {currentBalance !== null && (
          <div className="text-right shrink-0">
            <p className="text-xs text-gray-400 dark:text-gray-500 uppercase tracking-wide">Current balance</p>
            <p className={`text-xl font-bold tabular-nums ${currentBalance >= 0 ? "text-gray-900 dark:text-gray-100" : "text-red-600"}`}>
              {formatCurrency(currentBalance)}
            </p>
          </div>
        )}
      </div>

      {/* Month nav + summary strip */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <button
            onClick={prevMonth}
            className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-500 dark:text-gray-400 transition-colors"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <span className="text-base font-semibold text-gray-900 dark:text-gray-100 min-w-[140px] text-center">
            {title}
          </span>
          <button
            onClick={nextMonth}
            className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-500 dark:text-gray-400 transition-colors"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
        {!isThisMonth(new Date(year, month - 1, 1)) && (
          <button
            onClick={() => { setYear(now.getFullYear()); setMonth(now.getMonth() + 1); }}
            className="text-xs text-indigo-600 dark:text-indigo-400 hover:underline"
          >
            Back to today
          </button>
        )}
        {projectedNet !== 0 && (
          <div className={`ml-auto flex items-center gap-1.5 text-sm font-medium ${projectedNet >= 0 ? "text-emerald-600" : "text-red-600"}`}>
            {projectedNet >= 0 ? <TrendingUp className="w-4 h-4" /> : <TrendingDown className="w-4 h-4" />}
            Projected {projectedNet >= 0 ? "+" : ""}{formatCurrency(projectedNet)} this month
          </div>
        )}
      </div>

      {/* Calendar grid */}
      <Card className="border-0 ring-1 ring-gray-200 dark:ring-gray-800">
        <CardContent className="p-3">
          {/* Day headers */}
          <div className="grid grid-cols-7 mb-1">
            {DAYS.map(d => (
              <div key={d} className="text-center text-[10px] font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wide py-1">
                {d}
              </div>
            ))}
          </div>

          {loading ? (
            <div className="grid grid-cols-7 gap-1">
              {Array.from({ length: 42 }).map((_, i) => (
                <Skeleton key={i} className="h-20 rounded-lg" />
              ))}
            </div>
          ) : (
            <div className="grid grid-cols-7 gap-1">
              {days.map((day) => {
                const date = parseISO(day.date);
                const inMonth = date.getMonth() + 1 === month && date.getFullYear() === year;
                const today = isToday(date);
                const isProjected = day.isProjected;

                // Balance color hint (heat map within the month)
                let balanceBg = "";
                if (inMonth && maxBal > minBal) {
                  const t = (day.balance - minBal) / (maxBal - minBal);
                  if (t > 0.66) balanceBg = "ring-1 ring-emerald-100 dark:ring-emerald-900/40";
                  else if (t < 0.33) balanceBg = "ring-1 ring-red-100 dark:ring-red-900/40";
                }

                const visibleEvents = day.events.slice(0, 3);
                const overflow = day.events.length - visibleEvents.length;

                return (
                  <div
                    key={day.date}
                    className={`relative min-h-[88px] rounded-lg p-1.5 flex flex-col gap-0.5 transition-colors
                      ${inMonth ? "bg-white dark:bg-gray-900" : "bg-gray-50 dark:bg-gray-950 opacity-50"}
                      ${today ? "ring-2 ring-indigo-500" : balanceBg}
                      ${isProjected && inMonth ? "bg-indigo-50/30 dark:bg-indigo-950/10" : ""}
                    `}
                  >
                    {/* Day number + balance */}
                    <div className="flex items-start justify-between gap-0.5">
                      <span className={`text-[11px] font-semibold leading-none ${today ? "text-indigo-600 dark:text-indigo-400" : inMonth ? "text-gray-700 dark:text-gray-300" : "text-gray-400 dark:text-gray-600"}`}>
                        {date.getDate()}
                      </span>
                      {inMonth && (
                        <span className={`text-[9px] tabular-nums leading-none font-medium ${day.balance < 0 ? "text-red-500" : "text-gray-400 dark:text-gray-500"}`}>
                          {formatCurrency(Math.round(day.balance))}
                        </span>
                      )}
                    </div>

                    {/* Event chips */}
                    <div className="flex flex-col gap-0.5 mt-0.5">
                      {filterEvents(visibleEvents).map((ev, i) => (
                        <EventChip key={i} ev={ev} onDismiss={ev.isProjected ? () => dismissProjection(ev.label) : undefined} />
                      ))}
                      {overflow > 0 && (
                        <span className="text-[9px] text-gray-400 dark:text-gray-500 pl-1">
                          +{overflow} more
                        </span>
                      )}
                    </div>

                    {/* Projected indicator */}
                    {isProjected && inMonth && (
                      <div className="absolute top-1 right-1 w-1 h-1 rounded-full bg-indigo-300 dark:bg-indigo-600" />
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Legend */}
      <div className="flex items-center gap-4 text-xs text-gray-500 dark:text-gray-400 flex-wrap">
        <span className="flex items-center gap-1.5">
          <span className="w-3 h-3 rounded border border-emerald-200 bg-emerald-100 inline-block" />
          Payday / income
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-3 h-3 rounded border border-red-200 bg-red-100 inline-block" />
          Projected bill
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-3 h-3 rounded border border-gray-200 bg-gray-100 inline-block" />
          Actual spend
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-1.5 h-1.5 rounded-full bg-indigo-300 inline-block" />
          Projected day
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-3 h-3 rounded ring-2 ring-indigo-500 inline-block" />
          Today
        </span>
      </div>

      {/* Upcoming events list */}
      {upcoming.length > 0 && (
        <Card className="border-0 ring-1 ring-gray-200 dark:ring-gray-800">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base">Upcoming projected events</CardTitle>
              {dismissedProjections.size > 0 && (
                <button
                  onClick={restoreProjections}
                  className="text-xs text-indigo-600 dark:text-indigo-400 hover:underline"
                >
                  Restore {dismissedProjections.size} dismissed
                </button>
              )}
            </div>
          </CardHeader>
          <CardContent>
            <div className="divide-y divide-gray-50 dark:divide-gray-800">
              {upcoming.map((ev, i) => (
                <div key={i} className="flex items-center justify-between py-2.5 group/row">
                  <Link
                    href={`/transactions?search=${encodeURIComponent(ev.label)}`}
                    className="flex items-center gap-3 min-w-0 flex-1 hover:bg-gray-50 dark:hover:bg-gray-800 -mx-2 px-2 rounded-lg transition-colors"
                  >
                    <span className={`w-2 h-2 rounded-full shrink-0 ${ev.type === "income" ? "bg-emerald-500" : "bg-red-400"}`} />
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">{ev.label}</p>
                      <p className="text-xs text-gray-400 dark:text-gray-500">
                        {format(parseISO(ev.date), "EEE, MMM d")}
                        {ev.categoryName && ` · ${ev.categoryName}`}
                      </p>
                    </div>
                  </Link>
                  <div className="flex items-center gap-2 shrink-0 ml-4">
                    <span className={`text-sm font-semibold ${ev.type === "income" ? "text-emerald-600" : "text-gray-900 dark:text-gray-100"}`}>
                      {ev.type === "income" ? "+" : "−"}{formatCurrency(ev.amount)}
                    </span>
                    {ev.type !== "income" && (
                      <button
                        onClick={() => dismissProjection(ev.label)}
                        className="opacity-0 group-hover/row:opacity-100 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition-opacity"
                        title={`Dismiss ${ev.label} from projections`}
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
      {dismissedProjections.size > 0 && upcoming.length === 0 && (
        <p className="text-xs text-gray-400 dark:text-gray-500 text-center">
          {dismissedProjections.size} projection{dismissedProjections.size !== 1 ? "s" : ""} dismissed.{" "}
          <button onClick={restoreProjections} className="text-indigo-600 dark:text-indigo-400 hover:underline">Restore</button>
        </p>
      )}
    </div>
  );
}
