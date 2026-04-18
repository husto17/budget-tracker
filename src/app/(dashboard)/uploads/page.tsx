"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Upload, Trash2, FileText, FileSpreadsheet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { format } from "date-fns";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { fetchJson, FetchError } from "@/lib/fetcher";
import { Skeleton } from "@/components/ui/skeleton";

interface UploadRecord {
  id: string;
  fileName: string;
  fileType: string;
  rowCount: number;
  createdAt: string;
  account: {
    id: string;
    name: string;
    type: string;
  };
  _count: {
    transactions: number;
  };
}

export default function UploadsPage() {
  const router = useRouter();
  const [uploads, setUploads] = useState<UploadRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<UploadRecord | null>(null);
  const [deleting, setDeleting] = useState(false);

  async function fetchUploads() {
    setLoading(true);
    try {
      const data = await fetchJson<UploadRecord[]>("/api/uploads");
      setUploads(data);
      setLoadError(null);
    } catch (e) {
      setLoadError(e instanceof FetchError ? e.message : "Couldn't load uploads");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchUploads();
  }, []);

  async function handleDelete() {
    if (!deleteTarget) return;
    setDeleting(true);
    const res = await fetch(`/api/uploads/${deleteTarget.id}`, { method: "DELETE" });
    if (res.ok) {
      toast.success(`Deleted "${deleteTarget.fileName}" and its transactions`);
      setDeleteTarget(null);
      fetchUploads();
    } else {
      toast.error("Failed to delete upload");
    }
    setDeleting(false);
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Upload History</h1>
        <p className="text-sm text-gray-500 mt-1">All statements you have imported</p>
      </div>

      {loading ? (
        <div className="bg-white border border-gray-200 rounded-xl divide-y divide-gray-50">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="px-4 py-3 flex items-center gap-3">
              <Skeleton className="w-8 h-8 rounded" />
              <div className="flex-1 space-y-2">
                <Skeleton className="h-4 w-60" />
                <Skeleton className="h-3 w-40" />
              </div>
              <Skeleton className="h-5 w-16" />
            </div>
          ))}
        </div>
      ) : loadError ? (
        <div className="text-center py-12">
          <p className="text-sm text-red-600 font-medium">{loadError}</p>
          <Button variant="outline" size="sm" className="mt-3" onClick={fetchUploads}>
            Try again
          </Button>
        </div>
      ) : uploads.length === 0 ? (
        <div className="bg-white border border-gray-200 rounded-xl text-center py-16">
          <Upload className="w-12 h-12 mx-auto mb-4 text-gray-200" />
          <p className="text-gray-500 font-medium">No statements uploaded yet.</p>
          <p className="text-sm text-gray-400 mt-1">Upload your first statement.</p>
          <Button
            variant="outline"
            size="sm"
            className="mt-4"
            onClick={() => router.push("/upload")}
          >
            Go to Upload
          </Button>
        </div>
      ) : (
        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
          {/* Desktop table */}
          <div className="hidden md:block overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-100 text-xs text-gray-400 uppercase tracking-wide">
                  <th className="px-4 py-3 text-left">File Name</th>
                  <th className="px-4 py-3 text-left">Account</th>
                  <th className="px-4 py-3 text-left">Date Uploaded</th>
                  <th className="px-4 py-3 text-left">Type</th>
                  <th className="px-4 py-3 text-right"># Transactions</th>
                  <th className="px-4 py-3 text-right w-16"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {uploads.map((u) => (
                  <tr key={u.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        {u.fileType === "pdf" ? (
                          <FileText className="w-4 h-4 text-red-400 shrink-0" />
                        ) : (
                          <FileSpreadsheet className="w-4 h-4 text-green-500 shrink-0" />
                        )}
                        <span className="text-sm font-medium text-gray-900 truncate max-w-[240px]">
                          {u.fileName}
                        </span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-600">{u.account.name}</td>
                    <td className="px-4 py-3 text-sm text-gray-500 whitespace-nowrap">
                      {format(new Date(u.createdAt), "dd MMM yyyy, HH:mm")}
                    </td>
                    <td className="px-4 py-3">
                      <Badge variant="outline" className="text-xs uppercase">
                        {u.fileType}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 text-right text-sm text-gray-700 font-medium">
                      {u._count.transactions.toLocaleString()}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 text-gray-300 hover:text-red-500"
                        onClick={() => setDeleteTarget(u)}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile list */}
          <div className="md:hidden divide-y divide-gray-50">
            {uploads.map((u) => (
              <div key={u.id} className="px-4 py-3 flex items-center gap-3">
                {u.fileType === "pdf" ? (
                  <FileText className="w-8 h-8 text-red-400 shrink-0" />
                ) : (
                  <FileSpreadsheet className="w-8 h-8 text-green-500 shrink-0" />
                )}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-900 truncate">{u.fileName}</p>
                  <p className="text-xs text-gray-500 mt-0.5">
                    {u.account.name} &middot; {format(new Date(u.createdAt), "dd MMM yyyy")}
                  </p>
                  <p className="text-xs text-gray-400">
                    {u._count.transactions} transaction{u._count.transactions !== 1 ? "s" : ""}
                  </p>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 text-gray-300 hover:text-red-500 shrink-0"
                  onClick={() => setDeleteTarget(u)}
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </Button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Delete confirmation dialog */}
      <Dialog open={!!deleteTarget} onOpenChange={(open) => { if (!open) setDeleteTarget(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete upload?</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-gray-600">
            This will delete{" "}
            <strong>
              {deleteTarget?._count.transactions ?? 0} transaction
              {(deleteTarget?._count.transactions ?? 0) !== 1 ? "s" : ""}
            </strong>{" "}
            from &ldquo;{deleteTarget?.fileName}&rdquo;. This action cannot be undone.
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteTarget(null)} disabled={deleting}>
              Cancel
            </Button>
            <Button
              onClick={handleDelete}
              disabled={deleting}
              className="bg-red-600 hover:bg-red-700 text-white"
            >
              {deleting ? "Deleting..." : "Delete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
