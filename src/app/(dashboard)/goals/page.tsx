"use client";

import { useState, useEffect } from "react";
import { format, parseISO } from "date-fns";
import { Plus, Pencil, Trash2, Target, Calendar } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { fetchJson, FetchError, formatCurrency } from "@/lib/fetcher";

interface Goal {
  id: string;
  name: string;
  targetAmount: number;
  currentAmount: number;
  targetDate: string | null;
  color: string;
  linkedAccountId: string | null;
}

interface AccountLite {
  id: string;
  name: string;
  type: string;
  computedBalance: number;
}

export default function GoalsPage() {
  const [goals, setGoals] = useState<Goal[]>([]);
  const [accounts, setAccounts] = useState<AccountLite[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [showDialog, setShowDialog] = useState(false);
  const [editing, setEditing] = useState<Goal | null>(null);
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Goal | null>(null);

  const [form, setForm] = useState({
    name: "",
    targetAmount: "",
    currentAmount: "",
    targetDate: "",
    linkedAccountId: "",
  });

  async function load() {
    try {
      const [g, a] = await Promise.all([
        fetchJson<Goal[]>("/api/goals"),
        fetchJson<AccountLite[]>("/api/accounts"),
      ]);
      setGoals(g);
      setAccounts(a);
      setLoadError(null);
    } catch (e) {
      setLoadError(e instanceof FetchError ? e.message : "Couldn't load goals");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  function openAdd() {
    setEditing(null);
    setForm({ name: "", targetAmount: "", currentAmount: "", targetDate: "", linkedAccountId: "" });
    setShowDialog(true);
  }

  function openEdit(g: Goal) {
    setEditing(g);
    const linkedAcc = g.linkedAccountId ? accounts.find((a) => a.id === g.linkedAccountId) : null;
    setForm({
      name: g.name,
      targetAmount: String(g.targetAmount),
      currentAmount: linkedAcc ? String(Math.max(0, linkedAcc.computedBalance)) : String(g.currentAmount),
      targetDate: g.targetDate ? g.targetDate.slice(0, 10) : "",
      linkedAccountId: g.linkedAccountId ?? "",
    });
    setShowDialog(true);
  }

  async function handleSave() {
    setSaving(true);
    try {
      const body = {
        name: form.name,
        targetAmount: parseFloat(form.targetAmount),
        currentAmount: form.currentAmount ? parseFloat(form.currentAmount) : 0,
        targetDate: form.targetDate || null,
        linkedAccountId: form.linkedAccountId || null,
      };
      await fetchJson(editing ? `/api/goals/${editing.id}` : "/api/goals", {
        method: editing ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      toast.success(editing ? "Goal updated" : "Goal created");
      setShowDialog(false);
      load();
    } catch (e) {
      toast.error(e instanceof FetchError ? e.message : "Something went wrong");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    try {
      await fetchJson(`/api/goals/${deleteTarget.id}`, { method: "DELETE" });
      toast.success("Goal deleted");
      load();
    } catch {
      toast.error("Failed to delete");
      throw new Error("delete failed");
    }
  }

  function daysUntil(iso: string | null) {
    if (!iso) return null;
    const t = Math.round((new Date(iso).getTime() - Date.now()) / 86400000);
    return t;
  }

  function monthlyPaceNeeded(goal: Goal): number | null {
    if (!goal.targetDate) return null;
    const remaining = goal.targetAmount - goal.currentAmount;
    if (remaining <= 0) return 0;
    const target = new Date(goal.targetDate);
    const now = new Date();
    const monthsLeft =
      (target.getFullYear() - now.getFullYear()) * 12 +
      (target.getMonth() - now.getMonth()) +
      (target.getDate() >= now.getDate() ? 0 : -1);
    if (monthsLeft <= 0) return remaining; // overdue or this month → need it now
    return remaining / monthsLeft;
  }

  return (
    <div className="space-y-6 max-w-3xl mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100 flex items-center gap-2">
            <Target className="w-5 h-5 text-indigo-500" /> Goals
          </h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
            Track savings targets, trip funds, emergency reserves.
          </p>
        </div>
        <Button onClick={openAdd} size="sm">
          <Plus className="w-4 h-4 mr-2" /> New goal
        </Button>
      </div>

      {loading ? (
        <div className="space-y-3">
          {Array.from({ length: 2 }).map((_, i) => (
            <Card key={i}><CardContent className="p-6"><Skeleton className="h-20 w-full" /></CardContent></Card>
          ))}
        </div>
      ) : loadError ? (
        <div className="text-center py-12">
          <p className="text-sm text-red-600 font-medium">{loadError}</p>
          <Button variant="outline" size="sm" className="mt-3" onClick={load}>Try again</Button>
        </div>
      ) : goals.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <Target className="w-10 h-10 mx-auto mb-3 text-gray-200" />
            <p className="text-sm text-gray-500 dark:text-gray-400 font-medium">No goals yet</p>
            <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">Create one to start tracking progress.</p>
            <Button className="mt-4" size="sm" onClick={openAdd}>
              <Plus className="w-4 h-4 mr-2" /> Create your first goal
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {goals.map((g) => {
            const pct = Math.min((g.currentAmount / g.targetAmount) * 100, 100);
            const remaining = g.targetAmount - g.currentAmount;
            const days = daysUntil(g.targetDate);
            const monthlyPace = monthlyPaceNeeded(g);
            return (
              <Card key={g.id} className="overflow-hidden">
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <CardTitle className="text-base flex items-center gap-2">
                        <span className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: g.color }} />
                        {g.name}
                      </CardTitle>
                      <p className="text-xs text-gray-400 dark:text-gray-500 mt-1 flex items-center gap-3 flex-wrap">
                        <span>
                          {formatCurrency(g.currentAmount)} of {formatCurrency(g.targetAmount)}
                        </span>
                        {g.linkedAccountId && (() => {
                          const acc = accounts.find((a) => a.id === g.linkedAccountId);
                          if (!acc) return null;
                          return (
                            <span className="inline-flex items-center gap-1 text-indigo-500">
                              <span aria-hidden className="w-1 h-1 rounded-full bg-indigo-500" />
                              Tracks {acc.name}
                            </span>
                          );
                        })()}
                        {g.targetDate && (
                          <span className="inline-flex items-center gap-1">
                            <Calendar className="w-3 h-3" />
                            {format(parseISO(g.targetDate), "d MMM yyyy")}
                            {days !== null && days >= 0 && (
                              <span className="text-gray-400 dark:text-gray-500">({days}d left)</span>
                            )}
                            {days !== null && days < 0 && (
                              <span className="text-red-500">(overdue)</span>
                            )}
                          </span>
                        )}
                      </p>
                    </div>
                    <div className="flex items-center gap-1">
                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(g)}>
                        <Pencil className="w-3.5 h-3.5" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 text-red-400 hover:text-red-600"
                        onClick={() => setDeleteTarget(g)}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="flex items-center gap-3">
                    <div className="flex-1">
                      <div className="h-2.5 bg-gray-100 dark:bg-gray-800 rounded-full overflow-hidden">
                        <div
                          className="h-full rounded-full transition-all"
                          style={{ width: `${pct}%`, backgroundColor: g.color }}
                        />
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-sm font-semibold">{Math.round(pct)}%</p>
                      <p className="text-xs text-gray-400 dark:text-gray-500">
                        {remaining > 0 ? `${formatCurrency(remaining)} to go` : "Complete 🎉"}
                      </p>
                    </div>
                  </div>
                  {monthlyPace !== null && monthlyPace > 0 && (
                    <div className="mt-3 pt-3 border-t border-gray-100 dark:border-gray-800 flex items-center justify-between text-xs">
                      <span className="text-gray-500 dark:text-gray-400">
                        Pace to hit target{days !== null && days >= 0 ? " on time" : " (already overdue)"}
                      </span>
                      <span className="font-semibold text-gray-900 dark:text-gray-100 tabular-nums">
                        {formatCurrency(monthlyPace)}<span className="font-normal text-gray-400 dark:text-gray-500"> / month</span>
                      </span>
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editing ? "Edit goal" : "New goal"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="space-y-1.5">
              <Label>Name</Label>
              <Input
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                placeholder="Japan trip"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Target</Label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 dark:text-gray-500 text-sm">$</span>
                  <Input
                    type="number"
                    step="0.01"
                    min="0"
                    value={form.targetAmount}
                    onChange={(e) => setForm((f) => ({ ...f, targetAmount: e.target.value }))}
                    placeholder="10000"
                    className="pl-7"
                  />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label>
                  Saved so far
                  {form.linkedAccountId && (
                    <span className="ml-1 text-xs text-indigo-500 font-normal">(auto from account)</span>
                  )}
                </Label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 dark:text-gray-500 text-sm">$</span>
                  <Input
                    type="number"
                    step="0.01"
                    min="0"
                    value={form.currentAmount}
                    onChange={(e) => setForm((f) => ({ ...f, currentAmount: e.target.value }))}
                    placeholder="0"
                    className="pl-7"
                    disabled={!!form.linkedAccountId}
                  />
                </div>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Track an account <span className="text-gray-400 dark:text-gray-500 text-xs">(optional)</span></Label>
              <select
                value={form.linkedAccountId}
                onChange={(e) => {
                  const accId = e.target.value;
                  const acc = accounts.find((a) => a.id === accId);
                  setForm((f) => ({
                    ...f,
                    linkedAccountId: accId,
                    currentAmount: acc ? String(Math.max(0, acc.computedBalance)) : f.currentAmount,
                  }));
                }}
                className="w-full h-9 text-sm rounded-md border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 px-3"
              >
                <option value="">— none —</option>
                {accounts.map((a) => (
                  <option key={a.id} value={a.id}>{a.name}</option>
                ))}
              </select>
              {form.linkedAccountId && (
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  Progress auto-tracks the account&apos;s current balance.
                </p>
              )}
            </div>
            <div className="space-y-1.5">
              <Label>Target date <span className="text-gray-400 dark:text-gray-500 text-xs">(optional)</span></Label>
              <Input
                type="date"
                value={form.targetDate}
                onChange={(e) => setForm((f) => ({ ...f, targetDate: e.target.value }))}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDialog(false)} disabled={saving}>Cancel</Button>
            <Button
              onClick={handleSave}
              disabled={saving || !form.name.trim() || !form.targetAmount}
            >
              {saving ? "Saving..." : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={!!deleteTarget}
        onOpenChange={(open) => { if (!open) setDeleteTarget(null); }}
        title="Delete goal?"
        description={deleteTarget ? <>Delete <strong>&ldquo;{deleteTarget.name}&rdquo;</strong>? This cannot be undone.</> : null}
        confirmLabel="Delete"
        destructive
        onConfirm={handleDelete}
      />
    </div>
  );
}
