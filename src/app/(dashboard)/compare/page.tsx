"use client";

import { useEffect, useState, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { format } from "date-fns";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { MonthPicker } from "@/components/ui/month-picker";
import { MerchantLogo } from "@/components/ui/merchant-logo";
import { Button } from "@/components/ui/button";
import { ArrowLeftRight, ArrowRightLeft, TrendingDown, TrendingUp } from "lucide-react";
import Link from "next/link";
import { fetchJson, FetchError, formatCurrency } from "@/lib/fetcher";

interface InsightsResponse {
  thisMonthTotal: number;
  topCategories: [string, number][];
  topMerchants: Array<{ merchant: string; amount: number; count: number; categoryName: string | null; categoryColor: string | null }>;
  monthlyByCategory: Record<string, Record<string, number>>;
}

function currentMonthKey(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function prevMonthKey(month: string): string {
  const [y, m] = month.split("-").map(Number);
  const d = new Date(y, m - 2, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function prevYearKey(month: string): string {
  const [y, m] = month.split("-").map(Number);
  return `${y - 1}-${String(m).padStart(2, "0")}`;
}

function yearStartKey(month: string): string {
  const [y] = month.split("-").map(Number);
  return `${y}-01`;
}

function CompareContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const aParam = searchParams.get("a");
  const bParam = searchParams.get("b");

  const [monthA, setMonthA] = useState<string>(aParam ?? prevMonthKey(currentMonthKey()));
  const [monthB, setMonthB] = useState<string>(bParam ?? currentMonthKey());

  const [dataA, setDataA] = useState<InsightsResponse | null>(null);
  const [dataB, setDataB] = useState<InsightsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  // Keep URL in sync so the view is shareable
  useEffect(() => {
    const url = new URL(window.location.href);
    url.searchParams.set("a", monthA);
    url.searchParams.set("b", monthB);
    router.replace(`${url.pathname}${url.search}`, { scroll: false });
  }, [monthA, monthB, router]);

  useEffect(() => {
    setLoading(true);
    setErr(null);
    Promise.all([
      fetchJson<InsightsResponse>(`/api/insights?month=${monthA}`),
      fetchJson<InsightsResponse>(`/api/insights?month=${monthB}`),
    ])
      .then(([a, b]) => {
        setDataA(a);
        setDataB(b);
      })
      .catch((e) => setErr(e instanceof FetchError ? e.message : "Couldn't load"))
      .finally(() => setLoading(false));
  }, [monthA, monthB]);

  function swap() {
    setMonthA(monthB);
    setMonthB(monthA);
  }

  const [yA, mA] = monthA.split("-").map(Number);
  const [yB, mB] = monthB.split("-").map(Number);
  const labelA = format(new Date(yA, mA - 1, 1), "MMM yyyy");
  const labelB = format(new Date(yB, mB - 1, 1), "MMM yyyy");

  // Merge category totals across both months for side-by-side list
  const catsA = dataA?.monthlyByCategory[monthA] ?? {};
  const catsB = dataB?.monthlyByCategory[monthB] ?? {};
  const allCats = Array.from(new Set([...Object.keys(catsA), ...Object.keys(catsB)]));
  const categoryRows = allCats
    .map((name) => ({
      name,
      a: catsA[name] ?? 0,
      b: catsB[name] ?? 0,
      delta: (catsB[name] ?? 0) - (catsA[name] ?? 0),
    }))
    .sort((x, y) => Math.max(y.a, y.b) - Math.max(x.a, x.b));

  const totalA = dataA?.thisMonthTotal ?? 0;
  const totalB = dataB?.thisMonthTotal ?? 0;
  const totalDelta = totalB - totalA;
  const totalPct = totalA > 0 ? (totalDelta / totalA) * 100 : 0;

  // Merge merchant totals across both months and sort by biggest absolute delta.
  const merchantsA = new Map((dataA?.topMerchants ?? []).map((m) => [m.merchant, m]));
  const merchantsB = new Map((dataB?.topMerchants ?? []).map((m) => [m.merchant, m]));
  const allMerchants = Array.from(new Set([...merchantsA.keys(), ...merchantsB.keys()]));
  const merchantRows = allMerchants
    .map((name) => {
      const a = merchantsA.get(name)?.amount ?? 0;
      const b = merchantsB.get(name)?.amount ?? 0;
      const ref = merchantsB.get(name) ?? merchantsA.get(name)!;
      return { name, a, b, delta: b - a, categoryColor: ref.categoryColor };
    })
    .filter((r) => Math.abs(r.delta) > 0.5)
    .sort((x, y) => Math.abs(y.delta) - Math.abs(x.delta))
    .slice(0, 10);

  const thisMonth = currentMonthKey();

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100 flex items-center gap-2">
            <ArrowLeftRight className="w-5 h-5 text-indigo-500" /> Compare
          </h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
            Put two months side by side to spot trends and anomalies.
          </p>
        </div>
      </div>

      {/* Period pickers */}
      <Card className="border-0 ring-1 ring-gray-200 dark:ring-gray-800/80">
        <CardContent className="p-4 space-y-3">
          <div className="flex items-center justify-center gap-3 flex-wrap">
            <div className="flex flex-col items-center gap-1">
              <span className="text-xs text-gray-400 dark:text-gray-500 uppercase tracking-wide">Month A</span>
              <MonthPicker value={monthA} onChange={setMonthA} max={currentMonthKey()} />
            </div>
            <Button variant="ghost" size="icon" onClick={swap} title="Swap" aria-label="Swap periods">
              <ArrowRightLeft className="w-4 h-4" />
            </Button>
            <div className="flex flex-col items-center gap-1">
              <span className="text-xs text-gray-400 dark:text-gray-500 uppercase tracking-wide">Month B</span>
              <MonthPicker value={monthB} onChange={setMonthB} max={currentMonthKey()} />
            </div>
          </div>
          <div className="flex items-center justify-center gap-2 flex-wrap pt-1 border-t border-gray-100 dark:border-gray-800">
            <span className="text-xs text-gray-400 dark:text-gray-500 mr-1">Presets:</span>
            <Button
              variant="outline"
              size="sm"
              className="h-7 text-xs"
              onClick={() => {
                setMonthA(prevMonthKey(thisMonth));
                setMonthB(thisMonth);
              }}
            >
              This vs last month
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="h-7 text-xs"
              onClick={() => {
                setMonthA(prevYearKey(thisMonth));
                setMonthB(thisMonth);
              }}
            >
              This vs last year
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="h-7 text-xs"
              onClick={() => {
                setMonthA(prevYearKey(monthB));
                // keep monthB as-is
              }}
            >
              Same month, last year
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="h-7 text-xs"
              onClick={() => {
                setMonthA(yearStartKey(thisMonth));
                setMonthB(thisMonth);
              }}
            >
              YTD vs January
            </Button>
          </div>
        </CardContent>
      </Card>

      {err && (
        <div className="text-center py-6">
          <p className="text-sm text-red-600">{err}</p>
        </div>
      )}

      {loading ? (
        <div className="space-y-3">
          <Skeleton className="h-32 w-full" />
          <Skeleton className="h-64 w-full" />
        </div>
      ) : dataA && dataB ? (
        <>
          {/* Total summary */}
          <Card className="border-0 ring-1 ring-gray-200 dark:ring-gray-800/80">
            <CardContent className="p-6 grid grid-cols-2 gap-6 relative">
              <div>
                <p className="text-xs text-gray-400 dark:text-gray-500 uppercase tracking-wide">{labelA}</p>
                <p className="text-3xl font-bold mt-1 tabular-nums">{formatCurrency(totalA)}</p>
              </div>
              <div className="border-l border-gray-200 dark:border-gray-800 pl-6">
                <p className="text-xs text-gray-400 dark:text-gray-500 uppercase tracking-wide">{labelB}</p>
                <p className="text-3xl font-bold mt-1 tabular-nums">{formatCurrency(totalB)}</p>
                {totalA > 0 && (
                  <p className={`text-sm mt-1 flex items-center gap-1 ${totalDelta > 0 ? "text-rose-600" : "text-emerald-600"}`}>
                    {totalDelta > 0 ? <TrendingUp className="w-3.5 h-3.5" /> : <TrendingDown className="w-3.5 h-3.5" />}
                    {totalDelta > 0 ? "+" : "−"}{formatCurrency(Math.abs(totalDelta))}{" "}
                    <span className="text-gray-400 dark:text-gray-500">({totalPct > 0 ? "+" : ""}{totalPct.toFixed(0)}%)</span>
                  </p>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Category breakdown */}
          <Card className="border-0 ring-1 ring-gray-200 dark:ring-gray-800/80">
            <CardHeader className="pb-2">
              <CardTitle className="text-base">By category</CardTitle>
            </CardHeader>
            <CardContent>
              {categoryRows.length === 0 ? (
                <p className="text-sm text-gray-400 dark:text-gray-500 text-center py-6">No spending in either period</p>
              ) : (
                <div className="divide-y divide-gray-50 dark:divide-gray-800">
                  <div className="grid grid-cols-[1fr_auto_auto_auto] gap-3 pb-2 text-xs uppercase tracking-wide text-gray-400 dark:text-gray-500">
                    <span>Category</span>
                    <span className="text-right w-20 sm:w-24">{labelA}</span>
                    <span className="text-right w-20 sm:w-24">{labelB}</span>
                    <span className="text-right w-20 sm:w-24">Δ</span>
                  </div>
                  {categoryRows.map((row) => {
                    const up = row.delta > 0;
                    const noChange = row.a > 0 && row.b > 0 && row.delta === 0;
                    return (
                      <Link
                        key={row.name}
                        href={`/transactions?categoryName=${encodeURIComponent(row.name)}`}
                        className="grid grid-cols-[1fr_auto_auto_auto] gap-3 py-2.5 items-center hover:bg-gray-50 dark:hover:bg-gray-800/40 rounded-md transition-colors"
                      >
                        <span className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">{row.name}</span>
                        <span className="text-sm text-gray-600 dark:text-gray-300 tabular-nums text-right w-20 sm:w-24">
                          {row.a > 0 ? formatCurrency(row.a) : <span className="text-gray-300 dark:text-gray-600">—</span>}
                        </span>
                        <span className="text-sm text-gray-900 dark:text-gray-100 tabular-nums text-right w-20 sm:w-24 font-medium">
                          {row.b > 0 ? formatCurrency(row.b) : <span className="text-gray-300 dark:text-gray-600">—</span>}
                        </span>
                        <span
                          className={`text-sm tabular-nums text-right w-20 sm:w-24 ${
                            noChange
                              ? "text-gray-400 dark:text-gray-500"
                              : up
                              ? "text-rose-600"
                              : "text-emerald-600"
                          }`}
                        >
                          {noChange ? "—" : (up ? "+" : "−") + formatCurrency(Math.abs(row.delta))}
                        </span>
                      </Link>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Top merchants (top 6 of each) */}
          <div className="grid md:grid-cols-2 gap-4">
            {[{ label: labelA, data: dataA }, { label: labelB, data: dataB }].map((side) => (
              <Card key={side.label} className="border-0 ring-1 ring-gray-200 dark:ring-gray-800/80">
                <CardHeader className="pb-2">
                  <CardTitle className="text-base">Top merchants — {side.label}</CardTitle>
                </CardHeader>
                <CardContent>
                  {side.data.topMerchants.length === 0 ? (
                    <p className="text-sm text-gray-400 dark:text-gray-500 text-center py-4">No merchants in this period</p>
                  ) : (
                    <div className="space-y-2">
                      {side.data.topMerchants.slice(0, 6).map((m) => (
                        <Link
                          key={m.merchant}
                          href={`/merchants/${encodeURIComponent(m.merchant)}`}
                          className="flex items-center gap-2 py-1.5"
                        >
                          <MerchantLogo merchant={m.merchant} fallbackColor={m.categoryColor} size="sm" />
                          <span className="flex-1 text-sm truncate">{m.merchant}</span>
                          <span className="text-sm font-semibold tabular-nums">{formatCurrency(m.amount)}</span>
                        </Link>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>

          {/* Merchant deltas: who moved the most */}
          {merchantRows.length > 0 && (
            <Card className="border-0 ring-1 ring-gray-200 dark:ring-gray-800/80">
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Biggest merchant moves</CardTitle>
                <p className="text-xs text-gray-400 dark:text-gray-500">Ranked by absolute change between the two periods</p>
              </CardHeader>
              <CardContent>
                <div className="divide-y divide-gray-50 dark:divide-gray-800">
                  <div className="grid grid-cols-[auto_1fr_auto_auto_auto] gap-3 pb-2 text-xs uppercase tracking-wide text-gray-400 dark:text-gray-500">
                    <span className="w-6" />
                    <span>Merchant</span>
                    <span className="text-right w-20 sm:w-24">{labelA}</span>
                    <span className="text-right w-20 sm:w-24">{labelB}</span>
                    <span className="text-right w-20 sm:w-24">Δ</span>
                  </div>
                  {merchantRows.map((row) => {
                    const up = row.delta > 0;
                    return (
                      <Link
                        key={row.name}
                        href={`/merchants/${encodeURIComponent(row.name)}`}
                        className="grid grid-cols-[auto_1fr_auto_auto_auto] gap-3 py-2.5 items-center hover:bg-gray-50 dark:hover:bg-gray-800/40 rounded-md transition-colors"
                      >
                        <MerchantLogo merchant={row.name} fallbackColor={row.categoryColor} size="sm" />
                        <span className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">{row.name}</span>
                        <span className="text-sm text-gray-600 dark:text-gray-300 tabular-nums text-right w-20 sm:w-24">
                          {row.a > 0 ? formatCurrency(row.a) : <span className="text-gray-300 dark:text-gray-600">—</span>}
                        </span>
                        <span className="text-sm text-gray-900 dark:text-gray-100 tabular-nums text-right w-20 sm:w-24 font-medium">
                          {row.b > 0 ? formatCurrency(row.b) : <span className="text-gray-300 dark:text-gray-600">—</span>}
                        </span>
                        <span className={`text-sm tabular-nums text-right w-20 sm:w-24 ${up ? "text-rose-600" : "text-emerald-600"}`}>
                          {(up ? "+" : "−") + formatCurrency(Math.abs(row.delta))}
                        </span>
                      </Link>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          )}
        </>
      ) : null}
    </div>
  );
}

export default function ComparePage() {
  return (
    <Suspense fallback={<div className="text-center py-12 text-gray-400">Loading…</div>}>
      <CompareContent />
    </Suspense>
  );
}
