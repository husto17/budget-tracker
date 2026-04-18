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
  isDefault: boolean;
  rules: CategoryRule[];
  _count: { transactions: number };
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

  const [form, setForm] = useState({
    name: "",
    monthlyBudget: "",
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

  useEffect(() => { fetchCategories(); }, []);

  function openAdd() {
    setEditingCat(null);
    setForm({ name: "", monthlyBudget: "" });
    setShowDialog(true);
  }

  function openEdit(cat: Category) {
    setEditingCat(cat);
    setForm({
      name: cat.name,
      monthlyBudget: cat.monthlyBudget?.toString() ?? "",
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
        ...form,
        monthlyBudget: form.monthlyBudget ? parseFloat(form.monthlyBudget) : null,
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
      toast.success("Rule added — future uploads will auto-categorize matching transactions");
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
    const res = await fetch(`/api/categories/${cat.id}/rules`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ruleId }),
    });
    if (res.ok) {
      fetchCategories();
    }
  }

  const totalBudget = categories.reduce((sum, c) => sum + (c.monthlyBudget ?? 0), 0);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Categories</h1>
          <p className="text-sm text-gray-500 mt-1">
            Budget buckets • Monthly budget: {formatCurrency(totalBudget)}
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={applyAllRules}>
            <Zap className="w-4 h-4 mr-2" />
            Apply all rules
          </Button>
          <Button onClick={openAdd}>
            <Plus className="w-4 h-4 mr-2" />
            Add Category
          </Button>
        </div>
      </div>

      {loading ? (
        <div className="space-y-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <Card key={i}>
              <CardHeader className="py-4">
                <div className="flex items-center gap-3">
                  <Skeleton className="w-4 h-4 rounded-full" />
                  <div className="flex-1 space-y-2">
                    <Skeleton className="h-4 w-32" />
                    <Skeleton className="h-3 w-40" />
                  </div>
                </div>
              </CardHeader>
            </Card>
          ))}
        </div>
      ) : loadError ? (
        <div className="text-center py-12">
          <p className="text-sm text-red-600 font-medium">{loadError}</p>
          <Button variant="outline" size="sm" className="mt-3" onClick={() => { setLoading(true); fetchCategories(); }}>
            Try again
          </Button>
        </div>
      ) : (
        <div className="bg-white border border-gray-200 rounded-xl divide-y divide-gray-100 overflow-hidden">
          {categories.map((cat) => (
            <div key={cat.id}>
              <div
                className="px-4 py-2.5 cursor-pointer hover:bg-gray-50 transition-colors"
                onClick={() => setExpanded(expanded === cat.id ? null : cat.id)}
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <div
                      className="w-3 h-3 rounded-full flex-shrink-0"
                      style={{ backgroundColor: cat.color }}
                    />
                    <div className="min-w-0">
                      <CardTitle className="text-sm font-medium">{cat.name}</CardTitle>
                      <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                        {cat._count.transactions > 0 ? (
                          <Link
                            href={`/transactions?categoryId=${cat.id}`}
                            onClick={(e) => e.stopPropagation()}
                            className="text-xs text-blue-600 hover:underline inline-flex items-center gap-1"
                          >
                            {cat._count.transactions} transactions
                            <ArrowRight className="w-3 h-3" />
                          </Link>
                        ) : (
                          <span className="text-xs text-gray-400">
                            0 transactions
                          </span>
                        )}
                        {cat.monthlyBudget && (
                          <Badge variant="outline" className="text-xs">
                            Budget: {formatCurrency(cat.monthlyBudget)}/mo
                          </Badge>
                        )}
                        {cat.isDefault && (
                          <Badge variant="secondary" className="text-xs">Default</Badge>
                        )}
                        {cat.rules.length > 0 && (
                          <Badge variant="outline" className="text-xs text-blue-600 border-blue-200">
                            {cat.rules.length} auto-rule{cat.rules.length > 1 ? "s" : ""}
                          </Badge>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 shrink-0"
                      onClick={(e) => { e.stopPropagation(); openEdit(cat); }}
                    >
                      <Pencil className="w-3.5 h-3.5" />
                    </Button>
                    {!cat.isDefault && (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 text-red-400 hover:text-red-600 shrink-0"
                        onClick={(e) => { e.stopPropagation(); setDeleteTarget(cat); }}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    )}
                    {expanded === cat.id ? (
                      <ChevronUp className="w-4 h-4 text-gray-400 shrink-0" />
                    ) : (
                      <ChevronDown className="w-4 h-4 text-gray-400 shrink-0" />
                    )}
                  </div>
                </div>
              </div>

              {expanded === cat.id && (
                <div className="px-4 pt-0 pb-4 border-t border-gray-100 bg-gray-50/50">
                  <div className="mt-3">
                    <p className="text-sm font-medium text-gray-700 mb-2 flex items-center gap-1.5">
                      <Tag className="w-3.5 h-3.5" />
                      Auto-categorization rules
                    </p>
                    <p className="text-xs text-gray-400 mb-3">
                      When a transaction description contains any of these keywords, it will automatically be assigned to this category.
                    </p>

                    {cat.rules.length > 0 ? (
                      <div className="flex flex-wrap gap-2 mb-3">
                        {cat.rules.map((rule) => (
                          <Badge
                            key={rule.id}
                            variant="secondary"
                            className="pr-1 gap-1 font-mono text-xs"
                          >
                            {rule.isRegex ? "regex:" : ""}{rule.pattern}
                            <button
                              onClick={() => deleteRule(cat, rule.id)}
                              className="ml-1 hover:text-red-600 font-normal text-gray-400"
                            >
                              ×
                            </button>
                          </Badge>
                        ))}
                      </div>
                    ) : (
                      <p className="text-xs text-gray-400 mb-3 italic">No rules yet</p>
                    )}

                    <div className="flex gap-2">
                      <Input
                        value={newRule[cat.id] ?? ""}
                        onChange={(e) => setNewRule((prev) => ({ ...prev, [cat.id]: e.target.value }))}
                        onKeyDown={(e) => e.key === "Enter" && addRule(cat)}
                        placeholder="e.g. UBER, Tesco, Amazon"
                        className="h-8 text-sm"
                      />
                      <Button size="sm" className="h-8" onClick={() => addRule(cat)}>
                        Add
                      </Button>
                    </div>
                    {cat.rules.length > 0 && (
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-8 mt-2 text-xs"
                        onClick={() => applyRulesToCategory(cat)}
                      >
                        <Zap className="w-3.5 h-3.5 mr-1.5" />
                        Apply to existing transactions
                      </Button>
                    )}
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingCat ? "Edit Category" : "New Category"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>Name</Label>
              <Input
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                placeholder="e.g. Groceries"
              />
            </div>
            <div className="space-y-2">
              <Label>Monthly Budget <span className="text-gray-400">(optional)</span></Label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">$</span>
                <Input
                  value={form.monthlyBudget}
                  onChange={(e) => setForm((f) => ({ ...f, monthlyBudget: e.target.value }))}
                  placeholder="0.00"
                  type="number"
                  min="0"
                  step="0.01"
                  className="pl-7"
                />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDialog(false)}>Cancel</Button>
            <Button onClick={handleSave} disabled={saving || !form.name}>
              {saving ? "Saving..." : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={!!deleteTarget}
        onOpenChange={(open) => { if (!open) setDeleteTarget(null); }}
        title="Delete category?"
        description={
          deleteTarget ? (
            <>
              Delete <strong>&ldquo;{deleteTarget.name}&rdquo;</strong>?
              {deleteTarget._count.transactions > 0 && (
                <>
                  {" "}
                  {deleteTarget._count.transactions} transaction
                  {deleteTarget._count.transactions !== 1 ? "s" : ""} will become uncategorized.
                </>
              )}
            </>
          ) : null
        }
        confirmLabel="Delete"
        destructive
        onConfirm={handleDelete}
      />
    </div>
  );
}
