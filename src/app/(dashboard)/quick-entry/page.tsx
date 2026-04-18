"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { format } from "date-fns";
import { Camera, Upload, X, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import Link from "next/link";
import { toast } from "sonner";
import { fetchJson, FetchError, formatCurrency } from "@/lib/fetcher";

interface Account {
  id: string;
  name: string;
  type: string;
}

interface ExtractedTransaction {
  date: string;
  description: string;
  amount: number;
  isCredit: boolean;
  isPending: boolean;
  selected: boolean;
}

export default function QuickEntryPage() {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [accountId, setAccountId] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [extracting, setExtracting] = useState(false);
  const [extractError, setExtractError] = useState<string | null>(null);
  const [transactions, setTransactions] = useState<ExtractedTransaction[]>([]);
  const [saving, setSaving] = useState(false);
  const [saveResult, setSaveResult] = useState<{ saved: number; skipped: number } | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetchJson<Account[]>("/api/accounts")
      .then((data) => {
        setAccounts(data);
        if (data.length > 0) setAccountId(data[0].id);
      })
      .catch(() => toast.error("Couldn't load accounts"));
  }, []);

  const handleFileDrop = useCallback((f: File) => {
    setFile(f);
    setSaveResult(null);
    setTransactions([]);
    setExtractError(null);
    setPreview(URL.createObjectURL(f));
  }, []);

  useEffect(() => {
    if (!preview) return;
    return () => URL.revokeObjectURL(preview);
  }, [preview]);

  function handleDrop(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault();
    const f = e.dataTransfer.files[0];
    if (f) handleFileDrop(f);
  }

  function handleFileInput(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (f) handleFileDrop(f);
  }

  async function handleExtract() {
    if (!file || !accountId) return;
    setExtracting(true);
    setExtractError(null);
    setTransactions([]);
    setSaveResult(null);

    const formData = new FormData();
    formData.append("file", file);
    formData.append("accountId", accountId);

    try {
      const data = await fetchJson<{
        transactions: Array<{
          date: string | null;
          description: string;
          amount: number;
          isCredit: boolean;
          isPending: boolean;
        }>;
      }>("/api/upload/screenshot", { method: "POST", body: formData });

      const today = format(new Date(), "yyyy-MM-dd");
      const extracted: ExtractedTransaction[] = data.transactions.map((tx) => ({
        date: tx.date ?? today,
        description: tx.description,
        amount: tx.amount,
        isCredit: tx.isCredit,
        isPending: tx.isPending,
        selected: true,
      }));

      setTransactions(extracted);
    } catch (e) {
      const msg = e instanceof FetchError ? e.message : "Failed to extract transactions";
      setExtractError(msg);
      toast.error(msg);
    } finally {
      setExtracting(false);
    }
  }

  async function handleSave() {
    if (!accountId) return;
    setSaving(true);

    const toSave = transactions
      .filter((t) => t.selected)
      .map(({ date, description, amount, isCredit, isPending }) => ({
        date,
        description,
        amount,
        isCredit,
        isPending,
      }));

    try {
      const data = await fetchJson<{ saved: number; skipped: number }>(
        "/api/upload/screenshot/confirm",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ accountId, transactions: toSave }),
        },
      );
      setSaveResult({ saved: data.saved, skipped: data.skipped });
      setTransactions([]);
      setFile(null);
      setPreview(null);
      setExtractError(null);
    } catch (e) {
      const msg = e instanceof FetchError ? e.message : "Failed to save transactions";
      setExtractError(msg);
      toast.error(msg);
    } finally {
      setSaving(false);
    }
  }

  function updateTx(
    idx: number,
    field: keyof ExtractedTransaction,
    value: string | number | boolean
  ) {
    setTransactions((prev) =>
      prev.map((t, i) => (i === idx ? { ...t, [field]: value } : t))
    );
  }

  const selectedCount = transactions.filter((t) => t.selected).length;

  return (
    <div className="space-y-6 max-w-2xl mx-auto">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100 flex items-center gap-2">
          <Camera className="w-6 h-6" />
          Snap
        </h1>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
          Snap a photo or upload a screenshot — Claude extracts the transactions for you.
        </p>
      </div>

      {saveResult ? (
        <Card className="border-green-200 bg-green-50">
          <CardContent className="pt-6 pb-5 space-y-3 text-center">
            <div className="flex justify-center">
              <span className="w-12 h-12 rounded-full bg-green-100 flex items-center justify-center">
                <Check className="w-6 h-6 text-green-600" />
              </span>
            </div>
            <p className="text-green-800 font-semibold text-lg">
              Saved {saveResult.saved} transaction{saveResult.saved !== 1 ? "s" : ""}
              {saveResult.skipped > 0 && ` (${saveResult.skipped} duplicate${saveResult.skipped !== 1 ? "s" : ""} skipped)`}
            </p>
            <div className="flex justify-center gap-3 pt-1">
              <Link
                href="/transactions?status=pending"
                className="text-sm text-green-700 underline underline-offset-2 hover:text-green-900"
              >
                View pending transactions
              </Link>
              <button
                onClick={() => setSaveResult(null)}
                className="text-sm text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:text-gray-200"
              >
                Upload another
              </button>
            </div>
          </CardContent>
        </Card>
      ) : transactions.length === 0 ? (
        <Card>
          <CardContent className="pt-6 space-y-4">
            {/* Account selector */}
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-gray-700 dark:text-gray-200">Account</label>
              <Select
                value={accountId}
                onValueChange={(v) => setAccountId(v ?? accountId)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select account">
                    {accounts.find(a => a.id === accountId)?.name}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {accounts.map((a) => (
                    <SelectItem key={a.id} value={a.id}>
                      {a.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Drop zone */}
            <div
              onDrop={handleDrop}
              onDragOver={(e) => e.preventDefault()}
              onClick={() => fileInputRef.current?.click()}
              className="border-2 border-dashed border-gray-200 dark:border-gray-800 rounded-xl p-10 text-center cursor-pointer hover:border-blue-300 hover:bg-blue-50/30 transition-colors"
            >
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*,.heic"
                className="hidden"
                onChange={handleFileInput}
              />
              {preview ? (
                <div className="space-y-3">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={preview}
                    alt="Screenshot preview"
                    className="max-h-72 sm:max-h-48 mx-auto rounded-lg object-contain"
                  />
                  <p className="text-sm text-gray-500 dark:text-gray-400">{file?.name}</p>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setFile(null);
                      setPreview(null);
                      setExtractError(null);
                    }}
                    className="text-xs text-gray-400 dark:text-gray-500 hover:text-red-500 flex items-center gap-1 mx-auto"
                  >
                    <X className="w-3 h-3" /> Remove
                  </button>
                </div>
              ) : (
                <div className="space-y-2">
                  <Upload className="w-8 h-8 text-gray-300 dark:text-gray-600 mx-auto" />
                  <p className="text-sm font-medium text-gray-600 dark:text-gray-300">
                    Drag and drop a screenshot here
                  </p>
                  <p className="text-xs text-gray-400 dark:text-gray-500">
                    or click to browse — JPEG, PNG, HEIC
                  </p>
                </div>
              )}
            </div>

            {extractError && (
              <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-4 py-3">
                {extractError}
              </p>
            )}

            <Button
              onClick={handleExtract}
              disabled={!file || !accountId || extracting}
              className="w-full"
            >
              {extracting ? (
                <>
                  <span className="animate-spin mr-2 inline-block w-4 h-4 border-2 border-white/40 border-t-white rounded-full" />
                  Reading your screenshot with AI...
                </>
              ) : (
                <>
                  <Camera className="w-4 h-4 mr-2" />
                  Extract transactions
                </>
              )}
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-sm text-gray-600 dark:text-gray-300">
              {transactions.length} transaction{transactions.length !== 1 ? "s" : ""} found — review and confirm
            </p>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setTransactions([]);
                  setFile(null);
                  setPreview(null);
                  setExtractError(null);
                }}
              >
                Cancel
              </Button>
              <Button
                size="sm"
                disabled={selectedCount === 0 || saving}
                onClick={handleSave}
              >
                {saving ? "Saving..." : `Save ${selectedCount} transaction${selectedCount !== 1 ? "s" : ""}`}
              </Button>
            </div>
          </div>

          {extractError && (
            <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-4 py-3">
              {extractError}
            </p>
          )}

          <div className="border border-gray-200 dark:border-gray-800 rounded-xl overflow-hidden bg-white dark:bg-gray-900">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 dark:bg-gray-800 border-b border-gray-100 dark:border-gray-800">
                <tr className="text-xs text-gray-400 dark:text-gray-500 uppercase tracking-wide">
                  <th className="px-3 py-2 text-left w-8">
                    <input
                      type="checkbox"
                      checked={transactions.every((t) => t.selected)}
                      onChange={(e) =>
                        setTransactions((prev) =>
                          prev.map((t) => ({ ...t, selected: e.target.checked }))
                        )
                      }
                    />
                  </th>
                  <th className="px-3 py-2 text-left">Date</th>
                  <th className="px-3 py-2 text-left">Description</th>
                  <th className="px-3 py-2 text-right">Amount</th>
                  <th className="px-3 py-2 text-center">Type</th>
                  <th className="px-3 py-2 text-center">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50 dark:divide-gray-800">
                {transactions.map((tx, i) => (
                  <tr
                    key={i}
                    className={`transition-colors ${
                      tx.selected ? "" : "opacity-40"
                    } ${tx.isPending ? "bg-amber-50/40" : ""}`}
                  >
                    <td className="px-3 py-2">
                      <input
                        type="checkbox"
                        checked={tx.selected}
                        onChange={(e) => updateTx(i, "selected", e.target.checked)}
                      />
                    </td>
                    <td className="px-3 py-2">
                      <Input
                        type="date"
                        value={tx.date}
                        onChange={(e) => updateTx(i, "date", e.target.value)}
                        className="h-7 text-xs w-32"
                      />
                    </td>
                    <td className="px-3 py-2">
                      <Input
                        value={tx.description}
                        onChange={(e) => updateTx(i, "description", e.target.value)}
                        className="h-7 text-xs min-w-[180px]"
                      />
                    </td>
                    <td className="px-3 py-2 text-right">
                      <Input
                        type="number"
                        step="0.01"
                        min="0"
                        value={tx.amount}
                        onChange={(e) => updateTx(i, "amount", parseFloat(e.target.value) || 0)}
                        className="h-7 text-xs w-24 text-right"
                      />
                    </td>
                    <td className="px-3 py-2 text-center">
                      <button
                        onClick={() => updateTx(i, "isCredit", !tx.isCredit)}
                        className={`text-xs px-2 py-0.5 rounded-full font-medium transition-colors ${
                          tx.isCredit
                            ? "bg-green-100 text-green-700 hover:bg-green-200"
                            : "bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 hover:bg-gray-200"
                        }`}
                      >
                        {tx.isCredit ? "Credit" : "Debit"}
                      </button>
                    </td>
                    <td className="px-3 py-2 text-center">
                      {tx.isPending ? (
                        <Badge className="text-xs bg-amber-100 text-amber-700 border-amber-200 hover:bg-amber-100">
                          Pending
                        </Badge>
                      ) : (
                        <span className="text-xs text-gray-400 dark:text-gray-500">Posted</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="text-xs text-gray-400 dark:text-gray-500 text-right">
            Total selected: {formatCurrency(
              transactions
                .filter((t) => t.selected && !t.isCredit)
                .reduce((s, t) => s + t.amount, 0)
            )}
          </div>
        </div>
      )}
    </div>
  );
}
