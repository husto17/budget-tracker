"use client";

import { useState, useEffect } from "react";
import { toast } from "sonner";
import { Plus, Pencil, Trash2, CreditCard, Landmark, Wallet, PiggyBank, DollarSign } from "lucide-react";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";

const ACCOUNT_TYPES = [
  { value: "CHECKING", label: "Current / Checking", icon: Landmark },
  { value: "SAVINGS", label: "Savings", icon: PiggyBank },
  { value: "CREDIT_CARD", label: "Credit Card", icon: CreditCard },
  { value: "CASH", label: "Cash", icon: Wallet },
  { value: "INVESTMENT", label: "Investment", icon: DollarSign },
  { value: "OTHER", label: "Other", icon: Wallet },
];

function AccountIcon({ type }: { type: string }) {
  const found = ACCOUNT_TYPES.find((t) => t.value === type);
  const Icon = found?.icon ?? Wallet;
  return <Icon className="w-5 h-5" />;
}

function formatCurrency(amount: number) {
  return new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP" }).format(amount);
}

interface Account {
  id: string;
  name: string;
  type: string;
  institution: string | null;
  lastFour: string | null;
  computedBalance: number;
  _count: { transactions: number };
}

export default function AccountsPage() {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [loading, setLoading] = useState(true);
  const [showDialog, setShowDialog] = useState(false);
  const [editingAccount, setEditingAccount] = useState<Account | null>(null);
  const [saving, setSaving] = useState(false);

  const [form, setForm] = useState({
    name: "",
    type: "CHECKING",
    institution: "",
    lastFour: "",
  });

  async function fetchAccounts() {
    const res = await fetch("/api/accounts");
    const data = await res.json();
    setAccounts(data);
    setLoading(false);
  }

  useEffect(() => { fetchAccounts(); }, []);

  function openAdd() {
    setEditingAccount(null);
    setForm({ name: "", type: "CHECKING", institution: "", lastFour: "" });
    setShowDialog(true);
  }

  function openEdit(account: Account) {
    setEditingAccount(account);
    setForm({
      name: account.name,
      type: account.type,
      institution: account.institution ?? "",
      lastFour: account.lastFour ?? "",
    });
    setShowDialog(true);
  }

  async function handleSave() {
    setSaving(true);
    const url = editingAccount ? `/api/accounts/${editingAccount.id}` : "/api/accounts";
    const method = editingAccount ? "PATCH" : "POST";

    const res = await fetch(url, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });

    if (res.ok) {
      toast.success(editingAccount ? "Account updated" : "Account added");
      setShowDialog(false);
      fetchAccounts();
    } else {
      const data = await res.json();
      toast.error(data.error ?? "Something went wrong");
    }
    setSaving(false);
  }

  async function handleDelete(account: Account) {
    if (!confirm(`Delete "${account.name}"? This will also delete all associated transactions.`)) return;
    const res = await fetch(`/api/accounts/${account.id}`, { method: "DELETE" });
    if (res.ok) {
      toast.success("Account deleted");
      fetchAccounts();
    } else {
      toast.error("Failed to delete account");
    }
  }

  const totalBalance = accounts.reduce((sum, a) => {
    if (a.type === "CREDIT_CARD") return sum - Math.abs(a.computedBalance);
    return sum + a.computedBalance;
  }, 0);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Accounts</h1>
          <p className="text-sm text-gray-500 mt-1">Manage your bank accounts and credit cards</p>
        </div>
        <Button onClick={openAdd}>
          <Plus className="w-4 h-4 mr-2" />
          Add Account
        </Button>
      </div>

      {/* Net worth summary */}
      <Card className="bg-gradient-to-r from-blue-600 to-blue-700 text-white border-0">
        <CardContent className="pt-6">
          <p className="text-blue-100 text-sm font-medium">Net Balance</p>
          <p className="text-4xl font-bold mt-1">{formatCurrency(totalBalance)}</p>
          <p className="text-blue-200 text-sm mt-2">Across {accounts.length} accounts</p>
        </CardContent>
      </Card>

      {loading ? (
        <div className="text-center py-12 text-gray-400">Loading accounts...</div>
      ) : accounts.length === 0 ? (
        <div className="text-center py-12 text-gray-400">
          <Landmark className="w-12 h-12 mx-auto mb-3 opacity-30" />
          <p className="font-medium">No accounts yet</p>
          <p className="text-sm mt-1">Add your first bank account to get started</p>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {accounts.map((account) => {
            const typeInfo = ACCOUNT_TYPES.find((t) => t.value === account.type);
            const isCredit = account.type === "CREDIT_CARD";
            const balance = isCredit ? -account.computedBalance : account.computedBalance;

            return (
              <Card key={account.id} className="hover:shadow-md transition-shadow">
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-lg bg-gray-100 flex items-center justify-center text-gray-600">
                        <AccountIcon type={account.type} />
                      </div>
                      <div>
                        <CardTitle className="text-base">{account.name}</CardTitle>
                        <p className="text-xs text-gray-400 mt-0.5">
                          {account.institution ?? typeInfo?.label}
                          {account.lastFour && ` •••• ${account.lastFour}`}
                        </p>
                      </div>
                    </div>
                    <div className="flex gap-1">
                      <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEdit(account)}>
                        <Pencil className="w-3.5 h-3.5" />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-8 w-8 text-red-400 hover:text-red-600" onClick={() => handleDelete(account)}>
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="flex items-end justify-between">
                    <div>
                      <p className={`text-2xl font-bold ${isCredit && balance > 0 ? "text-red-600" : "text-gray-900"}`}>
                        {formatCurrency(balance)}
                      </p>
                      {isCredit && balance > 0 && (
                        <p className="text-xs text-red-500 mt-0.5">Outstanding balance</p>
                      )}
                    </div>
                    <Badge variant="secondary" className="text-xs">
                      {account._count.transactions} transactions
                    </Badge>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingAccount ? "Edit Account" : "Add Account"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>Account Name</Label>
              <Input
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                placeholder="e.g. Barclays Current"
              />
            </div>
            <div className="space-y-2">
              <Label>Account Type</Label>
              <Select value={form.type} onValueChange={(v) => setForm((f) => ({ ...f, type: v ?? f.type }))}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ACCOUNT_TYPES.map((t) => (
                    <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Bank / Institution <span className="text-gray-400">(optional)</span></Label>
              <Input
                value={form.institution}
                onChange={(e) => setForm((f) => ({ ...f, institution: e.target.value }))}
                placeholder="e.g. Barclays"
              />
            </div>
            <div className="space-y-2">
              <Label>Last 4 digits <span className="text-gray-400">(optional)</span></Label>
              <Input
                value={form.lastFour}
                onChange={(e) => setForm((f) => ({ ...f, lastFour: e.target.value }))}
                placeholder="1234"
                maxLength={4}
              />
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
    </div>
  );
}
