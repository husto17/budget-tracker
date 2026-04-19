"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { Plus, Pencil, Trash2, Tag, ChevronDown, ChevronUp, Zap, ArrowRight } from "lucide-react";
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
import { Badge } from "@/components/ui/badge";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { fetchJson, FetchError, formatCurrency } from "@/lib/fetcher";

interface CategoryRule {
  id: string;
  pattern: string;
  isRegex: boolean;
}

interface Category {
  id: string;
  name: string;
  color: string;
  monthlyBudget: number | null;
  budgetRollover: boolean;
  isDefault: boolean;
  rules: CategoryRule[];
  _count: { transactions: number };
}

interface MerchantAlias {
  id: string;
  fromName: string;
  toName: string;
}

export default function CategoriesPage() {
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [showDialog, setShowDialog] = useState(false);
  const [editingCat, setEditingCat] = useState<Category | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [newRule, setNewRule] = useState<{ [catId: string]: string }>({});
  const [deleteTarget, setDeleteTarget] = useState<Category | null>(null);
  const [hideUnusedDefaults, setHideUnusedDefaults] = useState(false);

  // Aliases state
  const [aliases, setAliases] = useState<MerchantAlias[]>([]);
  const [aliasFrom, setAliasFrom] = useState("");
  const [aliasTo, setAliasTo] = useState("");
  const [savingAlias, setSavingAlias] = useState(false);
  const [deleteAliasId, setDeleteAliasId] = useState<string | null>(null);

  useEffect(() => {
    try {
      const saved = localStorage.getItem("categories:hideUnusedDefaults");
      if (saved === "true") setHideUnusedDefaults(true);
    } catch {}
  }, []);

  function toggleHideUnused() {
    setHideUnusedDefaults((prev) => {
      const next = !prev;
      try { localStorage.setItem("categories:hideUnusedDefaults", String(next)); } catch {}
      return next;
    });
  }

  const [form, setForm] = useState({
    name: "",
    color: "#6366f1",
    monthlyBudget: "",
    budgetRollover: false,
  });

  async function fetchCategories() {
    try {
      const data = await fetchJson<Category[]>("/api/categories");
      setCategories(data);
      setLoadError(null);
    } catch (e) {
      setLoadError(e instanceof FetchError ? e.message : "Couldn't load categories");
    } finally {
      setLoading(false);
    }
  }

  async function fetchAliases() {
    try {
      const data = await fetchJson<MerchantAlias[]>("/api/merchant-aliases");
      setAliases(data);
    } catch {}
  }

  useEffect(() => {
    fetchCategories();
    fetchAliases();
  }, []);

  function openAdd() {
    setEditingCat(null);
    setForm({ name: "", color: "#6366f1", monthlyBudget: "", budgetRollover: false });
    setShowDialog(true);
  }

  function openEdit(cat: Category) {
    setEditingCat(cat);
    setForm({
      name: cat.name,
      color: cat.color,
      monthlyBudget: cat.monthlyBudget?.toString() ?? "",
      budgetRollover: cat.budgetRollover,
    });
    setShowDialog(true);
  }

  async function handleSave() {
    setSaving(true);
    const url = editingCat ? `/api/categories/${editingCat.id}` : "/api/categories";
    const method = editingCat ? "PATCH" : "POST";
    const res = await fetch(url, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: form.name,
        color: form.color,
        monthlyBudget: form.monthlyBudget ? parseFloat(form.monthlyBudget) : null,
        budgetRollover: form.budgetRollover,
      }),
    });
    if (res.ok) {
      toast.success(editingCat ? "Category updated" : "Category created");
      setShowDialog(false);
      fetchCategories();
    } else {
      const data = await res.json().catch(() => ({}));
      toast.error(data.error ?? "Something went wrong", {
        action: { label: "Retry", onClick: handleSave },
      });
    }
    setSaving(false);
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    const res = await fetch(`/api/categories/${deleteTarget.id}`, { method: "DELETE" });
    if (res.ok) {
      toast.success("Category deleted");
      fetchCategories();
    } else {
      toast.error("Failed to delete");
      throw new Error("delete failed");
    }
  }

  async function addRule(cat: Category) {
    const pattern = newRule[cat.id]?.trim();
    if (!pattern) return;
    const res = await fetch(`/api/categories/${cat.id}/rules`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pattern, isRegex: false }),
    });
    if (res.ok) {
      toast.success("Rule added");
      setNewRule((prev) => ({ ...prev, [cat.id]: "" }));
      fetchCategories();
    } else {
      toast.error("Failed to add rule");
    }
  }

  async function applyRulesToCategory(cat: Category) {
    const res = await fetch(`/api/categories/${cat.id}/rules/apply`, { method: "POST" });
    if (res.ok) {
      const data = await res.json();
      toast.success(`Applied rules: ${data.updated} transaction${data.updated !== 1 ? "s" : ""} updated`);
      fetchCategories();
    } else {
      toast.error("Failed to apply rules");
    }
  }

  async function applyAllRules() {
    const res = await fetch("/api/categories/rules/apply-all", { method: "POST" });
    if (res.ok) {
      const data = await res.json();
      toast.success(`Applied all rules: ${data.updated} transaction${data.updated !== 1 ? "s" : ""} updated`);
      fetchCategories();
    } else {
      toast.error("Failed to apply rules");
    }
  }

  async function deleteRule(cat: Category, ruleId: string) {
    const res = await fetch(`/api/categories/${cat.id}/rules?ruleId=${encodeURIComponent(ruleId)}`, {
      method: "DELETE",
    });
    if (res.ok) {
      fetchCategories();
    } else {
      const data = await res.json().catch(() => ({}));
      toast.error(data.error ?? "Failed to delete rule");
    }
  }

  async function handleCreateAlias(e: React.FormEvent) {
    e.preventDefault();
    if (!aliasFrom.trim() || !aliasTo.trim()) return;
    setSavingAlias(true);
    try {
      const alias = await fetchJson<MerchantAlias>("/api/merchant-aliases", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fromName: aliasFrom.trim(), toName: aliasTo.trim() }),
      });
      setAliases((prev) => [alias, ...prev.filter((a) => a.fromName !== alias.fromName)]);
      setAliasFrom("");
      setAliasTo("");
      toast.success("Alias saved");
    } catch (e) {
      toast.error(e instanceof FetchError ? e.message : "Failed to save alias");
    } finally {
      setSavingAlias(false);
    }
  }

  async function handleDeleteAlias(id: string) {
    try {
      await fetchJson(`/api/merchant-aliases/${id}`, { method: "DELETE" });
      setAliases((prev) => prev.filter((a) => a.id !== id));
      toast.success("Alias removed");
    } catch {
      toast.error("Failed to remove alias");
    }
    setDeleteAliasId(null);
  }

  const totalBudget = categories.reduce((sum, c) => sum + (c.monthlyBudget ?? 0), 0);
  const unusedDefaultCount = categories.filter(
    (c) => c.isDefault && c._count.transactions === 0 && c.rules.length === 0 && !c.monthlyBudget,
  ).length;
  const visibleCategories = hideUnusedDefaults
    ? categories.filter(
        (c) => !(c.isDefault && c._count.transactions === 0 && c.rules.length === 0 && !c.monthlyBudget),
      )
    : categories;

  return (
    <div className="space-y-5 max-w-6xl">
      {/* Header */}
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Rules</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
            Categories with auto-rules · {formatCurrency(totalBudget)}/mo budgeted
          </p>
        </div>
        <div className="flex gap-2 flex-wrap items-center">
          {unusedDefaultCount > 0 && (
            <button type="button" onClick={toggleHideUnused} className="text-xs text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100 flex items-center gap-1.5">
              <input type="checkbox" checked={hideUnusedDefaults} readOnly className="h-3.5 w-3.5 rounded border-gray-300 cursor-pointer" />
              Hide {unusedDefaultCount} unused
            </button>
          )}
          <Button variant="outline" onClick={applyAllRules}>
            <Zap className="w-4 h-4 mr-2" /> Apply all rules
          </Button>
          <Button onClick={openAdd}>
            <Plus className="w-4 h-4 mr-2" /> Add Category
          </Button>
        </div>
      </div>

      {/* Two-column layout */}
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-6 items-start">

        {/* ── Left: Categories ── */}
        <div className="space-y-3">
          <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">
            Categories ({visibleCategories.length})
          </p>
          {loading ? (
            <div className="space-y-2">
              {Array.from({ length: 4 }).map((_, i) => (
                <Card key={i}><CardHeader className="py-3"><div className="flex items-center gap-3"><Skeleton className="w-3 h-3 rounded-full" /><Skeleton className="h-4 w-32" /></div></CardHeader></Card>
              ))}
            </div>
          ) : loadError ? (
            <div className="text-center py-12">
              <p className="text-sm text-red-600 font-medium">{loadError}</p>
              <Button variant="outline" size="sm" className="mt-3" onClick={() => { setLoading(true); fetchCategories(); }}>Try again</Button>
            </div>
          ) : (
            <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl divide-y divide-gray-100 dark:divide-gray-800 overflow-hidden">
              {visibleCategories.map((cat) => (
                <div key={cat.id}>
                  <div className="px-4 py-2.5 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">
                    <div className="flex items-center justify-between gap-3">
                      <Link href={`/transactions?categoryId=${cat.id}`} className="flex items-center gap-3 min-w-0 flex-1 group">
                        <div className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: cat.color }} />
                        <div className="min-w-0">
                          <CardTitle className="text-sm font-medium group-hover:text-blue-600 transition-colors">{cat.name}</CardTitle>
                          <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                            <span className={cat._count.transactions > 0 ? "text-xs text-gray-500 dark:text-gray-400" : "text-xs text-gray-400 dark:text-gray-500"}>
                              {cat._count.transactions} tx
                            </span>
                            {cat.monthlyBudget && <Badge variant="outline" className="text-xs">{formatCurrency(cat.monthlyBudget)}/mo</Badge>}
                            {cat.isDefault && <Badge variant="secondary" className="text-xs">Default</Badge>}
                            {cat.rules.length > 0 && <Badge variant="outline" className="text-xs text-blue-600 border-blue-200">{cat.rules.length} rule{cat.rules.length > 1 ? "s" : ""}</Badge>}
                          </div>
                        </div>
                      </Link>
                      <div className="flex items-center gap-1">
                        <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0" onClick={() => openEdit(cat)}><Pencil className="w-3.5 h-3.5" /></Button>
                        {!cat.isDefault && (
                          <Button variant="ghost" size="icon" className="h-7 w-7 text-red-400 hover:text-red-600 shrink-0" onClick={() => setDeleteTarget(cat)}><Trash2 className="w-3.5 h-3.5" /></Button>
                        )}
                        <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0" onClick={() => setExpanded(expanded === cat.id ? null : cat.id)}>
                          {expanded === cat.id ? <ChevronUp className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}
                        </Button>
                      </div>
                    </div>
                  </div>
                  {expanded === cat.id && (
                    <div className="px-4 pt-0 pb-4 border-t border-gray-100 dark:border-gray-800 bg-gray-50 dark:bg-gray-800/50">
                      <div className="mt-3">
                        <p className="text-sm font-medium text-gray-700 dark:text-gray-200 mb-2 flex items-center gap-1.5">
                          <Tag className="w-3.5 h-3.5" /> Auto-categorization rules
                        </p>
                        {cat.rules.length > 0 ? (
                          <div className="flex flex-wrap gap-2 mb-3">
                            {cat.rules.map((rule) => (
                              <Badge key={rule.id} variant="secondary" className="pr-1 gap-1 font-mono text-xs">
                                {rule.isRegex ? "regex:" : ""}{rule.pattern}
                                <button type="button" onClick={(e) => { e.stopPropagation(); deleteRule(cat, rule.id); }} className="ml-1 hover:text-red-600 font-normal text-gray-400 dark:text-gray-500">×</button>
                              </Badge>
                            ))}
                          </div>
                        ) : (
                          <p className="text-xs text-gray-400 dark:text-gray-500 mb-3 italic">No rules yet</p>
                        )}
                        <div className="flex gap-2">
                          <Input value={newRule[cat.id] ?? ""} onChange={(e) => setNewRule((prev) => ({ ...prev, [cat.id]: e.target.value }))} onKeyDown={(e) => e.key === "Enter" && addRule(cat)} placeholder="e.g. UBER, Tesco, Amazon" className="h-8 text-sm" />
                          <Button size="sm" className="h-8" onClick={() => addRule(cat)}>Add</Button>
                        </div>
                        {cat.rules.length > 0 && (
                          <Button size="sm" variant="outline" className="h-8 mt-2 text-xs" onClick={() => applyRulesToCategory(cat)}>
                            <Zap className="w-3.5 h-3.5 mr-1.5" /> Apply to existing transactions
                          </Button>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* ── Right: Merchant Aliases ── */}
        <div className="space-y-3">
          <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">
            Merchant Aliases{aliases.length > 0 ? ` (${aliases.length})` : ""}
          </p>
          <Card>
            <CardContent className="pt-4 pb-4 space-y-3">
              <p className="text-xs text-gray-400 dark:text-gray-500">Rename raw bank strings to clean merchant names on import.</p>
              <form onSubmit={handleCreateAlias} className="space-y-2">
                <div className="space-y-1.5">
                  <Label className="text-xs">Raw bank text (contains…)</Label>
                  <Input placeholder="e.g. AMZN MKTP" value={aliasFrom} onChange={(e) => setAliasFrom(e.target.value)} className="h-8 text-sm" />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Display as</Label>
                  <Input placeholder="e.g. Amazon" value={aliasTo} onChange={(e) => setAliasTo(e.target.value)} className="h-8 text-sm" />
                </div>
                <Button type="submit" size="sm" className="w-full" disabled={savingAlias || !aliasFrom.trim() || !aliasTo.trim()}>
                  <Plus className="w-3.5 h-3.5 mr-1.5" /> Add alias
                </Button>
              </form>
            </CardContent>
          </Card>

          {aliases.length > 0 && (
            <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl divide-y divide-gray-100 dark:divide-gray-800 overflow-hidden">
              {aliases.map((alias) => (
                <div key={alias.id} className="flex items-center gap-2 px-3 py-2.5 group hover:bg-gray-50 dark:hover:bg-gray-800">
                  <code className="text-xs bg-gray-100 dark:bg-gray-800 px-1.5 py-0.5 rounded font-mono truncate max-w-[110px] text-gray-600 dark:text-gray-400" title={alias.fromName}>{alias.fromName}</code>
                  <ArrowRight className="w-3 h-3 text-gray-400 shrink-0" />
                  <span className="text-sm font-medium flex-1 truncate text-gray-900 dark:text-gray-100" title={alias.toName}>{alias.toName}</span>
                  <Button variant="ghost" size="icon" className="h-6 w-6 opacity-0 group-hover:opacity-100 text-gray-300 dark:text-gray-600 hover:text-red-500 transition-all shrink-0" onClick={() => setDeleteAliasId(alias.id)}>
                    <Trash2 className="w-3 h-3" />
                  </Button>
                </div>
              ))}
            </div>
          )}
          {!loading && aliases.length === 0 && (
            <p className="text-xs text-gray-400 dark:text-gray-600 text-center py-6">No aliases yet.</p>
          )}
        </div>
      </div>

      {/* Dialogs */}
      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingCat ? "Edit Category" : "New Category"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>Name</Label>
              <div className="flex items-center gap-2">
                <input type="color" value={form.color} onChange={(e) => setForm((f) => ({ ...f, color: e.target.value }))} className="h-9 w-9 rounded border border-gray-200 dark:border-gray-700 cursor-pointer p-0.5 shrink-0" />
                <Input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} placeholder="e.g. Groceries" />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Monthly Budget <span className="text-gray-400 dark:text-gray-500">(optional)</span></Label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 dark:text-gray-500 text-sm">$</span>
                <Input value={form.monthlyBudget} onChange={(e) => setForm((f) => ({ ...f, monthlyBudget: e.target.value }))} placeholder="0.00" type="number" min="0" step="0.01" className="pl-7" />
              </div>
            </div>
            {form.monthlyBudget && (
              <label className={`flex items-center justify-between gap-3 cursor-pointer select-none rounded-lg px-3 py-2.5 border transition-colors ${form.budgetRollover ? "border-indigo-200 dark:border-indigo-800 bg-indigo-50 dark:bg-indigo-900/20" : "border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/40"}`}>
                <div>
                  <p className="text-sm font-medium text-gray-900 dark:text-gray-100">Roll over unused budget</p>
                  <p className="text-xs text-gray-400 dark:text-gray-500">Unused budget carries forward to next month</p>
                </div>
                <input type="checkbox" checked={form.budgetRollover} onChange={(e) => setForm((f) => ({ ...f, budgetRollover: e.target.checked }))} className="h-4 w-4 rounded border-gray-300 shrink-0" />
              </label>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDialog(false)}>Cancel</Button>
            <Button onClick={handleSave} disabled={saving || !form.name}>{saving ? "Saving..." : "Save"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={!!deleteTarget}
        onOpenChange={(open) => { if (!open) setDeleteTarget(null); }}
        title="Delete category?"
        description={deleteTarget ? (<>Delete <strong>&ldquo;{deleteTarget.name}&rdquo;</strong>?{deleteTarget._count.transactions > 0 && (<> {deleteTarget._count.transactions} transaction{deleteTarget._count.transactions !== 1 ? "s" : ""} will become uncategorized.</>)}</>) : null}
        confirmLabel="Delete"
        destructive
        onConfirm={handleDelete}
      />
      <ConfirmDialog
        open={deleteAliasId !== null}
        onOpenChange={(o) => { if (!o) setDeleteAliasId(null); }}
        title="Remove alias?"
        description="Future imports will use the original merchant name. Existing transactions are not renamed."
        confirmLabel="Remove"
        onConfirm={() => { if (deleteAliasId) handleDeleteAlias(deleteAliasId); }}
      />
    </div>
  );
}
