"use client";

import { useState, useEffect } from "react";
import { toast } from "sonner";
import { format } from "date-fns";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { Account, Category } from "./types";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  accounts: Account[];
  categories: Category[];
  onAdded: () => void;
}

const initialForm = {
  accountId: "",
  date: format(new Date(), "yyyy-MM-dd"),
  description: "",
  amount: "",
  isCredit: false,
  categoryId: "",
  notes: "",
};

export function AddTransactionDialog({ open, onOpenChange, accounts, categories, onAdded }: Props) {
  const [form, setForm] = useState(initialForm);
  const [saving, setSaving] = useState(false);

  // Default to first account on mount / when list first arrives.
  useEffect(() => {
    if (!form.accountId && accounts.length > 0) {
      setForm((f) => ({ ...f, accountId: accounts[0].id }));
    }
  }, [accounts, form.accountId]);

  function reset() {
    setForm((f) => ({
      ...initialForm,
      accountId: f.accountId, // preserve chosen account across re-opens
      date: format(new Date(), "yyyy-MM-dd"),
    }));
  }

  async function handleAdd() {
    if (saving) return;
    setSaving(true);
    try {
      const res = await fetch("/api/transactions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          amount: parseFloat(form.amount),
          categoryId: form.categoryId || null,
        }),
      });
      if (res.ok) {
        toast.success("Transaction added");
        onOpenChange(false);
        reset();
        onAdded();
      } else {
        const d = await res.json().catch(() => ({}));
        toast.error(d.error ?? "Failed to add");
      }
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        onOpenChange(o);
        if (!o) reset();
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add Transaction</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <Label>Account</Label>
            <Select
              value={form.accountId}
              onValueChange={(v) => setForm((f) => ({ ...f, accountId: v ?? f.accountId }))}
            >
              <SelectTrigger>
                <SelectValue>{accounts.find((a) => a.id === form.accountId)?.name}</SelectValue>
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
              <Label>Amount ($)</Label>
              <Input
                type="number"
                step="0.01"
                min="0"
                value={form.amount}
                onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))}
                placeholder="0.00"
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label>Description</Label>
            <Input
              value={form.description}
              onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
              placeholder="e.g. Tesco Grocery Shop"
            />
          </div>
          <div className="space-y-2">
            <Label>Type</Label>
            <Select
              value={form.isCredit ? "credit" : "debit"}
              onValueChange={(v) => setForm((f) => ({ ...f, isCredit: v === "credit" }))}
            >
              <SelectTrigger>
                <SelectValue>
                  {form.isCredit ? "Credit (income / payment in)" : "Debit (expense / payment out)"}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="debit">Debit (expense / payment out)</SelectItem>
                <SelectItem value="credit">Credit (income / payment in)</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>
              Category <span className="text-gray-400 dark:text-gray-500">(optional)</span>
            </Label>
            <Select
              value={form.categoryId || "none"}
              onValueChange={(v) =>
                setForm((f) => ({ ...f, categoryId: v == null || v === "none" ? "" : v }))
              }
            >
              <SelectTrigger>
                <SelectValue placeholder="Select category">
                  {form.categoryId ? categories.find((c) => c.id === form.categoryId)?.name : undefined}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">— None</SelectItem>
                {categories.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    <div className="flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full" style={{ backgroundColor: c.color }} />
                      {c.name}
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>
              Notes <span className="text-gray-400 dark:text-gray-500">(optional)</span>
            </Label>
            <textarea
              value={form.notes}
              onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
              placeholder="Any additional notes..."
              className="w-full min-h-[72px] rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 resize-none"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancel
          </Button>
          <Button
            onClick={handleAdd}
            disabled={saving || !form.description || !form.amount || !form.accountId}
          >
            {saving ? "Adding..." : "Add"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
