"use client";

import { useState, useEffect, useMemo } from "react";
import { toast } from "sonner";
import { Plus, Trash2, Zap, ArrowRight, ChevronUp, ChevronDown } from "lucide-react";
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

interface MerchantAlias {
  id: string;
  fromName: string;
  toName: string;
  createdAt: string;
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

  const [aliases, setAliases] = useState<MerchantAlias[]>([]);
  const [aliasFrom, setAliasFrom] = useState("");
  const [aliasTo, setAliasTo] = useState("");
  const [savingAlias, setSavingAlias] = useState(false);
  const [deleteAliasId, setDeleteAliasId] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([
      fetchJson<Rule[]>("/api/rules"),
      fetchJson<Category[]>("/api/categories"),
      fetchJson<MerchantAlias[]>("/api/merchant-aliases"),
    ])
      .then(([r, c, a]) => { setRules(r); setCategories(c); setAliases(a); })
      .catch(() => toast.error("Failed to load"))
      .finally(() => setLoading(false));
  }, []);

  // Group rules by category
  const rulesByCategory = useMemo(() => {
    const map = new Map<string, { category: Category; rules: Rule[] }>();
    for (const rule of rules) {
      const key = rule.category.id;
      if (!map.has(key)) map.set(key, { category: rule.category, rules: [] });
      map.get(key)!.rules.push(rule);
    }
    return Array.from(map.values()).sort((a, b) => a.category.name.localeCompare(b.category.name));
  }, [rules]);

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

  return (
    <div className="max-w-5xl space-y-6">
      {/* Page header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Rules</h1>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
          Auto-categorization rules are learned when you categorize transactions. Aliases rename merchants on import.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_300px] gap-6 items-start">
        {/* ── Left: Category rules ── */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Zap className="w-4 h-4 text-gray-400 dark:text-gray-500" />
              <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100">
                Category Rules
                {rules.length > 0 && (
                  <span className="ml-2 text-xs font-normal text-gray-400 dark:text-gray-500">{rules.length} rules</span>
                )}
              </h2>
            </div>
            <Button size="sm" variant="outline" onClick={() => setShowForm((v) => !v)}>
              <Plus className="w-3.5 h-3.5 mr-1.5" /> New rule
            </Button>
          </div>

          {showForm && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm">Create rule</CardTitle>
              </CardHeader>
              <CardContent>
                <form onSubmit={handleCreate} className="space-y-3">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <Label className="text-xs">Pattern (merchant contains…)</Label>
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
                      Regex pattern
                    </label>
                    <div className="flex items-center gap-2">
                      <Label className="text-xs shrink-0">Priority</Label>
                      <Input
                        type="number"
                        value={form.priority}
                        onChange={(e) => setForm((f) => ({ ...f, priority: parseInt(e.target.value) || 0 }))}
                        className="w-16 h-8"
                      />
                    </div>
                  </div>
                  <div className="flex gap-2 justify-end pt-1">
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
            <div className="space-y-3">
              {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-20 w-full" />)}
            </div>
          ) : rules.length === 0 ? (
            <Card>
              <CardContent className="py-10 text-center">
                <Zap className="w-7 h-7 text-gray-300 dark:text-gray-600 mx-auto mb-2" />
                <p className="text-sm text-gray-500 dark:text-gray-400">No rules yet.</p>
                <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
                  Rules are learned automatically when you categorize transactions.
                </p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-3">
              {rulesByCategory.map(({ category, rules: catRules }) => (
                <Card key={category.id}>
                  <CardContent className="p-0">
                    {/* Category header */}
                    <div className="flex items-center gap-2 px-4 py-2.5 border-b border-gray-100 dark:border-gray-800 bg-gray-50 dark:bg-gray-800/40 rounded-t-xl">
                      <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: category.color }} />
                      <span className="text-sm font-medium text-gray-800 dark:text-gray-200">{category.name}</span>
                      <span className="text-xs text-gray-400 dark:text-gray-500 ml-auto">
                        {catRules.length} rule{catRules.length !== 1 ? "s" : ""}
                      </span>
                    </div>
                    {/* Rules in this category */}
                    <div className="divide-y divide-gray-50 dark:divide-gray-800/60">
                      {catRules.sort((a, b) => b.priority - a.priority).map((rule) => (
                        <div key={rule.id} className="flex items-center gap-2 px-4 py-2 group">
                          <div className="flex flex-col gap-0">
                            <button
                              onClick={() => movePriority(rule, 1)}
                              className="text-gray-200 dark:text-gray-700 hover:text-gray-500 dark:hover:text-gray-400 transition-colors"
                            >
                              <ChevronUp className="w-3 h-3" />
                            </button>
                            <button
                              onClick={() => movePriority(rule, -1)}
                              className="text-gray-200 dark:text-gray-700 hover:text-gray-500 dark:hover:text-gray-400 transition-colors"
                            >
                              <ChevronDown className="w-3 h-3" />
                            </button>
                          </div>
                          <code className="text-sm bg-gray-100 dark:bg-gray-800 px-2 py-0.5 rounded font-mono flex-1 truncate">
                            {rule.pattern}
                          </code>
                          {rule.isRegex && <Badge variant="secondary" className="text-[10px] shrink-0">regex</Badge>}
                          <span className="text-[10px] text-gray-300 dark:text-gray-600 shrink-0 tabular-nums">p={rule.priority}</span>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6 opacity-0 group-hover:opacity-100 text-gray-300 dark:text-gray-600 hover:text-red-500 transition-all shrink-0"
                            onClick={() => setDeleteId(rule.id)}
                          >
                            <Trash2 className="w-3 h-3" />
                          </Button>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>

        {/* ── Right: Merchant aliases ── */}
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <ArrowRight className="w-4 h-4 text-gray-400 dark:text-gray-500" />
            <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100">
              Merchant Aliases
              {aliases.length > 0 && (
                <span className="ml-2 text-xs font-normal text-gray-400 dark:text-gray-500">{aliases.length}</span>
              )}
            </h2>
          </div>

          <Card>
            <CardContent className="pt-4 pb-3 space-y-3">
              <p className="text-xs text-gray-400 dark:text-gray-500">
                Rename merchants on import. e.g. "AMZN MKTP" → "Amazon".
              </p>
              <form onSubmit={handleCreateAlias} className="space-y-2">
                <div className="space-y-1.5">
                  <Label className="text-xs">From (as it appears)</Label>
                  <Input
                    placeholder="AMZN MKTP"
                    value={aliasFrom}
                    onChange={(e) => setAliasFrom(e.target.value)}
                    className="h-8 text-sm"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">To (canonical name)</Label>
                  <Input
                    placeholder="Amazon"
                    value={aliasTo}
                    onChange={(e) => setAliasTo(e.target.value)}
                    className="h-8 text-sm"
                  />
                </div>
                <Button
                  type="submit"
                  size="sm"
                  className="w-full"
                  disabled={savingAlias || !aliasFrom.trim() || !aliasTo.trim()}
                >
                  <Plus className="w-3.5 h-3.5 mr-1.5" /> Add alias
                </Button>
              </form>
            </CardContent>
          </Card>

          {loading ? (
            <div className="space-y-2">
              {Array.from({ length: 2 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}
            </div>
          ) : aliases.length > 0 && (
            <Card>
              <CardContent className="p-0">
                <div className="divide-y divide-gray-100 dark:divide-gray-800">
                  {aliases.map((alias) => (
                    <div key={alias.id} className="flex items-center gap-2 px-3 py-2.5 group">
                      <code className="text-xs bg-gray-100 dark:bg-gray-800 px-1.5 py-0.5 rounded font-mono truncate max-w-[90px]" title={alias.fromName}>
                        {alias.fromName}
                      </code>
                      <ArrowRight className="w-3 h-3 text-gray-400 shrink-0" />
                      <code className="text-xs bg-indigo-50 dark:bg-indigo-900/20 text-indigo-700 dark:text-indigo-300 px-1.5 py-0.5 rounded font-mono flex-1 truncate" title={alias.toName}>
                        {alias.toName}
                      </code>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6 opacity-0 group-hover:opacity-100 text-gray-300 dark:text-gray-600 hover:text-red-500 transition-all shrink-0"
                        onClick={() => setDeleteAliasId(alias.id)}
                      >
                        <Trash2 className="w-3 h-3" />
                      </Button>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </div>

      <ConfirmDialog
        open={deleteId !== null}
        onOpenChange={(o) => { if (!o) setDeleteId(null); }}
        title="Delete rule?"
        description="This rule will no longer apply to future imports. Existing categorizations are not affected."
        confirmLabel="Delete"
        onConfirm={() => { if (deleteId) handleDelete(deleteId); }}
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
