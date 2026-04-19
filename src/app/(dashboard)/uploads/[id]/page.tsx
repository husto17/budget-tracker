"use client";

import { useEffect, useState, use } from "react";
import Link from "next/link";
import { format } from "date-fns";
import {
  ArrowLeft,
  ArrowRight,
  FileText,
  FileSpreadsheet,
  AlertTriangle,
  CheckCircle2,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { fetchJson, FetchError, formatCurrency } from "@/lib/fetcher";

interface UploadDetail {
  id: string;
  fileName: string;
  fileType: string;
  rowCount: number;
  createdAt: string;
  openingBalance: number | null;
  closingBalance: number | null;
  statementStart: string | null;
  statementEnd: string | null;
  parsedDelta: number;
  statementDelta: number | null;
  parseDiff: number | null;
  txCounts: { credits: number; debits: number };
  account: { id: string; name: string; type: string; institution: string | null } | null;
  transactions: Array<{
    id: string;
    date: string;
    description: string;
    merchant: string | null;
    amount: number;
    isCredit: boolean;
    isPending: boolean;
    category: { name: string; color: string } | null;
  }>;
}

export default function UploadDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [detail, setDetail] = useState<UploadDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchJson<UploadDetail>(`/api/uploads/${id}`)
      .then((d) => {
        if (cancelled) return;
        setDetail(d);
      })
      .catch((e) => {
        if (cancelled) return;
        setErr(e instanceof FetchError ? e.message : "Couldn't load");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [id]);

  if (loading) {
    return (
      <div className="space-y-4 max-w-4xl">
        <Skeleton className="h-4 w-32" />
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (err || !detail) {
    return (
      <div className="max-w-4xl text-center py-12">
        <p className="text-sm text-red-600 font-medium">{err ?? "Upload not found"}</p>
        <Link href="/uploads" className="text-sm text-blue-600 hover:underline mt-3 inline-block">
          Back to uploads
        </Link>
      </div>
    );
  }

  const hasParseDiff = detail.parseDiff !== null && Math.abs(detail.parseDiff) > 0.01;

  return (
    <div className="space-y-6 max-w-4xl">
      <div>
        <Link
          href="/uploads"
          className="text-xs text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100 inline-flex items-center gap-1"
        >
          <ArrowLeft className="w-3 h-3" /> All uploads
        </Link>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100 flex items-center gap-2 mt-1">
          {detail.fileType === "pdf" ? (
            <FileText className="w-5 h-5 text-red-400" />
          ) : (
            <FileSpreadsheet className="w-5 h-5 text-green-500" />
          )}
          <span className="truncate">{detail.fileName}</span>
        </h1>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
          {detail.account?.name}
          {detail.account?.institution ? ` · ${detail.account.institution}` : ""}
          {" · "}
          Uploaded {format(new Date(detail.createdAt), "dd MMM yyyy, HH:mm")}
        </p>
      </div>

      {/* Statement-level summary */}
      <Card className="border-0 ring-1 ring-gray-200 dark:ring-gray-800/80">
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Statement summary</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div>
              <p className="text-[10px] uppercase tracking-wide text-gray-400 dark:text-gray-500">Period</p>
              <p className="text-sm font-medium text-gray-900 dark:text-gray-100 mt-0.5">
                {detail.statementStart && detail.statementEnd ? (
                  <>
                    {format(new Date(detail.statementStart), "dd MMM")}
                    <br />
                    to {format(new Date(detail.statementEnd), "dd MMM yyyy")}
                  </>
                ) : detail.statementEnd ? (
                  <>through {format(new Date(detail.statementEnd), "dd MMM yyyy")}</>
                ) : (
                  <span className="text-gray-400 dark:text-gray-500 font-normal">not captured</span>
                )}
              </p>
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-wide text-gray-400 dark:text-gray-500">Opening</p>
              <p className="text-sm font-semibold text-gray-900 dark:text-gray-100 mt-0.5 tabular-nums">
                {detail.openingBalance != null ? formatCurrency(detail.openingBalance) : <span className="text-gray-400 dark:text-gray-500 font-normal">—</span>}
              </p>
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-wide text-gray-400 dark:text-gray-500">Closing</p>
              <p className="text-sm font-semibold text-gray-900 dark:text-gray-100 mt-0.5 tabular-nums">
                {detail.closingBalance != null ? formatCurrency(detail.closingBalance) : <span className="text-gray-400 dark:text-gray-500 font-normal">—</span>}
              </p>
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-wide text-gray-400 dark:text-gray-500">Statement Δ</p>
              <p className="text-sm font-semibold text-gray-900 dark:text-gray-100 mt-0.5 tabular-nums">
                {detail.statementDelta != null
                  ? (detail.statementDelta > 0 ? "+" : "") + formatCurrency(detail.statementDelta)
                  : <span className="text-gray-400 dark:text-gray-500 font-normal">—</span>}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Parse coverage */}
      <Card className="border-0 ring-1 ring-gray-200 dark:ring-gray-800/80">
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Parse coverage</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            <div className="grid grid-cols-3 gap-4">
              <div>
                <p className="text-[10px] uppercase tracking-wide text-gray-400 dark:text-gray-500">Parsed Δ</p>
                <p className="text-sm font-semibold text-gray-900 dark:text-gray-100 mt-0.5 tabular-nums">
                  {(detail.parsedDelta > 0 ? "+" : "") + formatCurrency(detail.parsedDelta)}
                </p>
              </div>
              <div>
                <p className="text-[10px] uppercase tracking-wide text-gray-400 dark:text-gray-500">Credits</p>
                <p className="text-sm font-semibold text-emerald-600 dark:text-emerald-400 mt-0.5 tabular-nums">
                  {detail.txCounts.credits.toLocaleString()}
                </p>
              </div>
              <div>
                <p className="text-[10px] uppercase tracking-wide text-gray-400 dark:text-gray-500">Debits</p>
                <p className="text-sm font-semibold text-rose-600 dark:text-rose-400 mt-0.5 tabular-nums">
                  {detail.txCounts.debits.toLocaleString()}
                </p>
              </div>
            </div>
            {detail.parseDiff !== null && (
              <div
                className={`flex items-start gap-2 px-3 py-2 rounded-lg text-sm ${
                  hasParseDiff
                    ? "bg-amber-50 dark:bg-amber-900/30 text-amber-800 dark:text-amber-200"
                    : "bg-emerald-50 dark:bg-emerald-900/30 text-emerald-800 dark:text-emerald-200"
                }`}
              >
                {hasParseDiff ? <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" /> : <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />}
                <div className="min-w-0">
                  {hasParseDiff ? (
                    <>
                      Parsed transactions are <strong>{formatCurrency(Math.abs(detail.parseDiff))}</strong>{" "}
                      {detail.parseDiff > 0 ? "above" : "below"} the statement delta — likely indicates missed rows or fees the parser didn&apos;t catch.
                    </>
                  ) : (
                    <>Parsed transactions reconcile with the statement delta exactly.</>
                  )}
                </div>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Transactions */}
      <Card className="border-0 ring-1 ring-gray-200 dark:ring-gray-800/80">
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Transactions ({detail.transactions.length.toLocaleString()})</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="divide-y divide-gray-50 dark:divide-gray-800">
            {detail.transactions.length === 0 ? (
              <p className="px-4 py-6 text-sm text-gray-400 dark:text-gray-500 text-center">
                No transactions attached to this upload — they may have been deleted.
              </p>
            ) : (
              detail.transactions.map((t) => (
                <Link
                  key={t.id}
                  href={`/transactions?search=${encodeURIComponent(t.description)}`}
                  className="px-4 py-2.5 flex items-center gap-3 hover:bg-gray-50 dark:hover:bg-gray-800/40"
                >
                  <span className="text-xs text-gray-400 dark:text-gray-500 whitespace-nowrap w-16 tabular-nums">
                    {format(new Date(t.date), "dd MMM")}
                  </span>
                  <span className="flex-1 text-sm text-gray-900 dark:text-gray-100 truncate">
                    {t.merchant ?? t.description}
                  </span>
                  {t.category && (
                    <Badge variant="outline" className="text-[10px] hidden sm:inline-flex" style={{ borderColor: t.category.color, color: t.category.color }}>
                      {t.category.name}
                    </Badge>
                  )}
                  <span
                    className={`text-sm font-semibold tabular-nums shrink-0 w-24 text-right ${
                      t.isCredit ? "text-emerald-600 dark:text-emerald-400" : "text-gray-900 dark:text-gray-100"
                    }`}
                  >
                    {t.isCredit ? "+" : "−"}
                    {formatCurrency(t.amount)}
                  </span>
                  <ArrowRight className="w-3 h-3 text-gray-300 dark:text-gray-600 shrink-0 hidden sm:block" />
                </Link>
              ))
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
