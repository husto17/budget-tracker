"use client";

import { useState, useEffect } from "react";
import { toast } from "sonner";
import { format } from "date-fns";
import { Pencil } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { Transaction } from "./types";

interface Props {
  tx: Transaction | null;
  onClose: () => void;
  onSaved: () => void;
}

export function EditTransactionDialog({ tx, onClose, onSaved }: Props) {
  const [form, setForm] = useState({ description: "", amount: "", date: "", notes: "" });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!tx) return;
    setForm({
      description: tx.merchant ?? tx.description,
      amount: tx.amount.toFixed(2),
      date: format(new Date(tx.date), "yyyy-MM-dd"),
      notes: tx.notes ?? "",
    });
  }, [tx]);

  async function handleSave() {
    if (!tx) return;
    setSaving(true);
    const res = await fetch(`/api/transactions/${tx.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        description: form.description,
        merchant: form.description,
        amount: form.amount,
        date: form.date,
        notes: form.notes || null,
      }),
    });
    if (res.ok) {
      toast.success("Transaction updated");
      onSaved();
      onClose();
    } else {
      toast.error("Failed to save");
    }
    setSaving(false);
  }

  return (
    <Dialog open={!!tx} onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Pencil className="w-4 h-4" /> Edit Transaction
          </DialogTitle>
        </DialogHeader>
        {tx && (
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>Description / Merchant</Label>
              <Input
                value={form.description}
                onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Date</Label>
                <Input
                  type="date"
                  value={form.date}
                  onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <Label>Amount</Label>
                <Input
                  type="number"
                  step="0.01"
                  min="0"
                  value={form.amount}
                  onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))}
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Notes <span className="text-gray-400 dark:text-gray-500">(optional)</span></Label>
              <textarea
                value={form.notes}
                onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
                placeholder="Any notes..."
                className="w-full min-h-[64px] rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring resize-none"
              />
            </div>
          </div>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={handleSave} disabled={saving || !form.description || !form.amount}>
            {saving ? "Saving..." : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
