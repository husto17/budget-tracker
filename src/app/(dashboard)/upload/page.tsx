"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { Upload, FileText, FileSpreadsheet, CheckCircle, AlertCircle, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { fetchJson } from "@/lib/fetcher";

interface Account {
  id: string;
  name: string;
  type: string;
  institution: string | null;
}

interface UploadResult {
  imported: number;
  skipped: number;
  transferPairsLinked: number;
  errors: string[];
}

export default function UploadPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const preselectedAccountId = searchParams.get("accountId") ?? "";
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [accountId, setAccountId] = useState(preselectedAccountId);
  const [dragOver, setDragOver] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [result, setResult] = useState<UploadResult | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetchJson<Account[]>("/api/accounts")
      .then((data) => {
        setAccounts(data);
        if (data.length === 0) return;
        const preselected = preselectedAccountId && data.find((a) => a.id === preselectedAccountId);
        setAccountId(preselected ? preselected.id : data[0].id);
      })
      .catch(() => toast.error("Couldn't load accounts"));
  }, [preselectedAccountId]);

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragOver(false);
    const dropped = e.dataTransfer.files[0];
    if (dropped) validateAndSetFile(dropped);
  }

  function handleFileInput(e: React.ChangeEvent<HTMLInputElement>) {
    const selected = e.target.files?.[0];
    if (selected) validateAndSetFile(selected);
  }

  function validateAndSetFile(f: File) {
    const ext = f.name.split(".").pop()?.toLowerCase();
    if (ext !== "csv" && ext !== "pdf") {
      toast.error("Only CSV and PDF files are supported");
      return;
    }
    setFile(f);
    setResult(null);
  }

  async function handleUpload() {
    if (!file || !accountId) return;
    setUploading(true);
    setResult(null);

    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("accountId", accountId);

      const data = await fetchJson<UploadResult>("/api/upload", {
        method: "POST",
        body: formData,
      });
      setResult(data);
      if (data.imported === 0 && data.skipped > 0) {
        toast.info(`Already up to date — ${data.skipped} duplicate${data.skipped !== 1 ? "s" : ""} skipped`);
      } else if (data.imported === 0) {
        toast.warning("No transactions found — check that you selected the right account and file");
      } else {
        toast.success(`Imported ${data.imported} transaction${data.imported !== 1 ? "s" : ""}${data.skipped > 0 ? ` (${data.skipped} duplicates skipped)` : ""}`);
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Upload failed — please try again");
    } finally {
      setUploading(false);
    }
  }

  const isCSV = file?.name.endsWith(".csv");

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Upload Statement</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
            Import transactions from a CSV or PDF bank statement
          </p>
        </div>
        <a href="/uploads" className="text-sm text-blue-600 hover:underline whitespace-nowrap mt-1">
          View upload history &rarr;
        </a>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">1. Select account</CardTitle>
        </CardHeader>
        <CardContent>
          {accounts.length === 0 ? (
            <p className="text-sm text-gray-500 dark:text-gray-400">
              No accounts yet.{" "}
              <a href="/accounts" className="text-blue-600 hover:underline">Add an account first.</a>
            </p>
          ) : (
            <div className="space-y-2">
              <Label>Which account does this statement belong to?</Label>
              <Select value={accountId} onValueChange={(v) => setAccountId(v ?? "")}>
                <SelectTrigger>
                  <SelectValue placeholder="Select account">
                    {(() => { const a = accounts.find(x => x.id === accountId); return a ? `${a.name}${a.institution ? ` — ${a.institution}` : ""}` : undefined; })()}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {accounts.map((acc) => (
                    <SelectItem key={acc.id} value={acc.id}>
                      {acc.name}
                      {acc.institution ? ` — ${acc.institution}` : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">2. Upload file</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="mb-3 p-3 bg-blue-50 dark:bg-blue-900/20 border border-blue-100 dark:border-blue-800 rounded-lg text-xs text-blue-800 dark:text-blue-200 space-y-1">
            <p><strong>Tip:</strong> CSV exports parse most reliably. PDF works for text-based statements — if results are incomplete, try a CSV from your bank&apos;s portal instead.</p>
            <p className="text-blue-600 dark:text-blue-300">
              <strong>Supported PDF banks:</strong> Bank of America (checking &amp; credit), Chase, Wells Fargo, Citi, Capital One, Ally Bank, Apple Card — plus a generic fallback for others.
            </p>
          </div>
          <div
            className={`border-2 border-dashed rounded-xl p-10 text-center cursor-pointer transition-colors ${
              dragOver
                ? "border-blue-400 bg-blue-50"
                : file
                ? "border-green-300 bg-green-50"
                : "border-gray-200 dark:border-gray-800 hover:border-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800"
            }`}
            onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={handleDrop}
            onClick={() => inputRef.current?.click()}
          >
            <input
              ref={inputRef}
              type="file"
              accept=".csv,.pdf"
              className="hidden"
              onChange={handleFileInput}
            />
            {file ? (
              <div className="flex flex-col items-center gap-2">
                {isCSV ? (
                  <FileSpreadsheet className="w-10 h-10 text-green-500" />
                ) : (
                  <FileText className="w-10 h-10 text-red-500" />
                )}
                <p className="font-medium text-gray-900 dark:text-gray-100">{file.name}</p>
                <p className="text-sm text-gray-400 dark:text-gray-500">
                  {(file.size / 1024).toFixed(1)} KB
                </p>
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:text-gray-300"
                  onClick={(e) => { e.stopPropagation(); setFile(null); setResult(null); }}
                >
                  <X className="w-3.5 h-3.5 mr-1" /> Remove
                </Button>
              </div>
            ) : (
              <div className="flex flex-col items-center gap-2">
                <Upload className="w-10 h-10 text-gray-300 dark:text-gray-600" />
                <p className="font-medium text-gray-600 dark:text-gray-300">
                  <span className="hidden sm:inline">Drop your statement here</span>
                  <span className="sm:hidden">Tap to choose a statement</span>
                </p>
                <p className="hidden sm:block text-sm text-gray-400 dark:text-gray-500">or click to browse</p>
                <div className="flex gap-2 mt-2">
                  <Badge variant="outline" className="text-xs">.CSV</Badge>
                  <Badge variant="outline" className="text-xs">.PDF</Badge>
                </div>
              </div>
            )}
          </div>

        </CardContent>
      </Card>

      <Button
        className="w-full"
        size="lg"
        disabled={!file || !accountId || uploading}
        onClick={handleUpload}
      >
        {uploading ? "Processing..." : "Import Transactions"}
      </Button>

      {result && (
        <Card className={result.imported === 0 ? "border-gray-200 bg-gray-50 dark:border-gray-700 dark:bg-gray-800/40" : "border-green-200 bg-green-50 dark:border-green-800 dark:bg-green-900/20"}>
          <CardContent className="pt-6 space-y-3">
            <div className={`flex items-center gap-2 ${result.imported === 0 ? "text-gray-600 dark:text-gray-300" : "text-green-700 dark:text-green-400"}`}>
              <CheckCircle className="w-5 h-5" />
              <span className="font-semibold">{result.imported === 0 ? "Nothing new to import" : "Import complete"}</span>
            </div>
            <div className="grid grid-cols-3 gap-3 text-center">
              <div className="bg-white dark:bg-gray-900 rounded-lg p-3 border border-green-200">
                <p className="text-2xl font-bold text-green-700">{result.imported}</p>
                <p className="text-xs text-gray-500 dark:text-gray-400">Imported</p>
              </div>
              <div className="bg-white dark:bg-gray-900 rounded-lg p-3 border border-green-200">
                <p className="text-2xl font-bold text-gray-400 dark:text-gray-500">{result.skipped}</p>
                <p className="text-xs text-gray-500 dark:text-gray-400">Duplicates skipped</p>
              </div>
              <div className="bg-white dark:bg-gray-900 rounded-lg p-3 border border-green-200">
                <p className="text-2xl font-bold text-blue-600">{result.transferPairsLinked}</p>
                <p className="text-xs text-gray-500 dark:text-gray-400">Transfers linked</p>
              </div>
            </div>
            {result.transferPairsLinked > 0 && (
              <p className="text-xs text-blue-600 text-center">
                Transfer pairs auto-detected — these won&apos;t double-count in your spending totals.
              </p>
            )}
            {result.errors.length > 0 && (
              <div className="mt-3 p-3 bg-amber-50 border border-amber-200 rounded-lg">
                <div className="flex items-center gap-1.5 text-amber-700 text-sm font-medium mb-2">
                  <AlertCircle className="w-4 h-4" />
                  {result.errors.length} parsing note{result.errors.length > 1 ? "s" : ""}
                </div>
                <ul className="text-xs text-amber-600 space-y-1">
                  {result.errors.slice(0, 5).map((e, i) => (
                    <li key={i}>• {e}</li>
                  ))}
                  {result.errors.length > 5 && (
                    <li className="text-amber-500">...and {result.errors.length - 5} more</li>
                  )}
                </ul>
              </div>
            )}
            <div className="flex gap-2 pt-2">
              <Button variant="outline" size="sm" className="flex-1" onClick={() => { setFile(null); setResult(null); }}>
                Upload another
              </Button>
              <Button size="sm" className="flex-1" onClick={() => router.push("/transactions")}>
                View transactions
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
