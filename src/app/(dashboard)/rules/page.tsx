"use client";

import { useState, useEffect } from "react";
import { toast } from "sonner";
import { Plus, Trash2, Zap, ChevronUp, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { fetchJson, FetchError } from "@/lib/fetcher";

interface Category {
  id: string;
  name: string;
  color: string;
}

interface Rule {
  id: string;
  pattern: string;
  isRegex: boolean;
  priority: number;
  createdAt: string;
  category: Category;
}

const BLANK = { pattern: "", categoryId: "", isRegex: false, priority: 0 };

export default function RulesPage() {
  const [rules, setRules] = useState<Rule[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(BLANK);
  const [saving, setSaving] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([
      fetchJson<Rule[]>("/api/rules"),
      fetchJson<Category[]>("/api/categories"),
    ])
      .then(([r, c]) => { setRules(r); setCategories(c); })
      .catch(() => toast.error("Failed to load"))
      .finally(() => setLoading(false));
  }, []);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!form.pattern.trim() || !form.categoryId) return;
    setSaving(true);
    try {
      const rule = await fetchJson<Rule>("/api/rules", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      setRules((prev) => [rule, ...prev]);
      setForm(BLANK);
      setShowForm(false);
      toast.success("Rule created");
    } catch (e) {
      toast.error(e instanceof FetchError ? e.message : "Failed to create rule");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: string) {
    try {
      await fetchJson(`/api/rules/${id}`, { method: "DELETE" });
      setRules((prev) => prev.filter((r) => r.id !== id));
      toast.success("Rule deleted");
    } catch {
      toast.error("Failed to delete rule");
    }
    setDeleteId(null);
  }

  async function movePriority(rule: Rule, direction: 1 | -1) {
    const newPriority = rule.priority + direction * 10;
    try {
      const updated = await fetchJson<Rule>(`/api/rules/${rule.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ priority: newPriority }),
      });
      setRules((prev) => prev.map((r) => (r.id === rule.id ? updated : r)).sort((a, b) => b.priority - a.priority));
    } catch {
      toast.error("Failed to update priority");
    }
  }

  return (
    <div className="space-y-6 max-w-3xl">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Auto-Categorization Rules</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
            Rules run on every import and apply categories automatically. Higher priority rules win when multiple match.
            Rules are also learned automatically when you manually change a category.
          </p>
        </div>
        <Button size="sm" onClick={() => setShowForm((v) => !v)}>
          <Plus className="w-4 h-4 mr-1.5" /> New rule
        </Button>
      </div>

      {showForm && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Zap className="w-4 h-4" /> Create rule
            </CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleCreate} className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label className="text-xs">Pattern (merchant name contains…)</Label>
                  <Input
                    value={form.pattern}
                    onChange={(e) => setForm((f) => ({ ...f, pattern: e.target.value }))}
                    placeholder="e.g. Starbucks"
                    required
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Assign to category</Label>
                  <Select
                    value={form.categoryId}
                    onValueChange={(v) => setForm((f) => ({ ...f, categoryId: v ?? "" }))}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Choose category…" />
                    </SelectTrigger>
                    <SelectContent>
                      {categories.map((c) => (
                        <SelectItem key={c.id} value={c.id}>
                          <span className="flex items-center gap-2">
                            <span className="w-2 h-2 rounded-full inline-block" style={{ backgroundColor: c.color }} />
                            {c.name}
                          </span>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="flex items-center gap-4">
                <label className="flex items-center gap-2 text-sm cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={form.isRegex}
                    onChange={(e) => setForm((f) => ({ ...f, isRegex: e.target.checked }))}
                    className="rounded"
                  />
                  Treat pattern as regex
                </label>
                <div className="flex items-center gap-2">
                  <Label className="text-xs shrink-0">Priority</Label>
                  <Input
                    type="number"
                    value={form.priority}
                    onChange={(e) => setForm((f) => ({ ...f, priority: parseInt(e.target.value) || 0 }))}
                    className="w-20 h-8"
                  />
                </div>
              </div>
              <div className="flex gap-2 justify-end">
                <Button type="button" variant="ghost" size="sm" onClick={() => { setShowForm(false); setForm(BLANK); }}>
                  Cancel
                </Button>
                <Button type="submit" size="sm" disabled={saving || !form.pattern.trim() || !form.categoryId}>
                  {saving ? "Saving…" : "Save rule"}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      {loading ? (
        <div className="space-y-2">
          {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-14 w-full" />)}
        </div>
      ) : rules.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <Zap className="w-8 h-8 text-gray-300 dark:text-gray-600 mx-auto mb-3" />
            <p className="text-sm text-gray-500 dark:text-gray-400">No rules yet.</p>
            <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
              Rules are learned automatically when you categorize transactions, or create one manually above.
            </p>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-0">
            <div className="divide-y divide-gray-100 dark:divide-gray-800">
              {rules.map((rule) => (
                <div key={rule.id} className="flex items-center gap-3 px-4 py-3">
                  <div className="flex flex-col gap-0.5">
                    <button
                      onClick={() => movePriority(rule, 1)}
                      className="text-gray-300 dark:text-gray-600 hover:text-gray-600 dark:hover:text-gray-300"
                    >
                      <ChevronUp className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => movePriority(rule, -1)}
                      className="text-gray-300 dark:text-gray-600 hover:text-gray-600 dark:hover:text-gray-300"
                    >
                      <ChevronDown className="w-3.5 h-3.5" />
                    </button>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <code className="text-sm bg-gray-100 dark:bg-gray-800 px-2 py-0.5 rounded font-mono">
                        {rule.pattern}
                      </code>
                      {rule.isRegex && <Badge variant="secondary" className="text-[10px]">regex</Badge>}
                      <span className="text-gray-400 dark:text-gray-500 text-xs">→</span>
                      <span className="flex items-center gap-1.5 text-sm font-medium text-gray-800 dark:text-gray-200">
                        <span className="w-2 h-2 rounded-full inline-block" style={{ backgroundColor: rule.category.color }} />
                        {rule.category.name}
                      </span>
                    </div>
                  </div>
                  <span className="text-xs text-gray-400 dark:text-gray-500 shrink-0">p={rule.priority}</span>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 text-gray-400 dark:text-gray-500 hover:text-red-500 shrink-0"
                    onClick={() => setDeleteId(rule.id)}
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </Button>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      <ConfirmDialog
        open={deleteId !== null}
        onOpenChange={(o) => { if (!o) setDeleteId(null); }}
        title="Delete rule?"
        description="This rule will no longer apply to future imports. Existing categorizations are not affected."
        confirmLabel="Delete"
        onConfirm={() => { if (deleteId) handleDelete(deleteId); }}
      />
    </div>
  );
}
