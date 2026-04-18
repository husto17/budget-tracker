"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
  CommandShortcut,
} from "@/components/ui/command";
import {
  LayoutDashboard,
  ArrowUpDown,
  Camera,
  Upload,
  Wallet,
  Tags,
  TrendingUp,
  Settings,
  Plus,
  Search,
  Sparkles,
  Target,
  Keyboard,
  ArrowLeftRight,
} from "lucide-react";
import { fetchJson } from "@/lib/fetcher";

interface Category {
  id: string;
  name: string;
  color: string;
}

interface Transaction {
  id: string;
  merchant: string | null;
  description: string;
  amount: number;
  date: string;
}

export function CommandPalette() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [categories, setCategories] = useState<Category[]>([]);
  const [results, setResults] = useState<Transaction[]>([]);

  // Cmd/Ctrl + K opens it anywhere
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((o) => !o);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // Lazy-load categories the first time the palette opens
  useEffect(() => {
    if (!open || categories.length > 0) return;
    fetchJson<Category[]>("/api/categories")
      .then(setCategories)
      .catch(() => {});
  }, [open, categories.length]);

  // Debounced transaction search when the user types
  useEffect(() => {
    const q = query.trim();
    if (!open || q.length < 2) {
      setResults([]);
      return;
    }
    const t = setTimeout(() => {
      fetchJson<{ transactions: Transaction[] }>(`/api/transactions?search=${encodeURIComponent(q)}&limit=5`)
        .then((data) => setResults(data.transactions ?? []))
        .catch(() => setResults([]));
    }, 200);
    return () => clearTimeout(t);
  }, [query, open]);

  function go(href: string) {
    setOpen(false);
    router.push(href);
  }

  return (
    <CommandDialog open={open} onOpenChange={setOpen}>
      <CommandInput placeholder="Search transactions, jump to a page…" value={query} onValueChange={setQuery} />
      <CommandList>
        <CommandEmpty>No matches</CommandEmpty>

        {results.length > 0 && (
          <CommandGroup heading="Transactions">
            {results.map((t) => (
              <CommandItem
                key={t.id}
                value={`tx-${t.id}`}
                onSelect={() => go(`/transactions?search=${encodeURIComponent(t.merchant ?? t.description)}`)}
              >
                <Search className="mr-2 h-4 w-4 text-gray-400 dark:text-gray-500" />
                <span className="flex-1 truncate">{t.merchant ?? t.description}</span>
                <span className="text-xs text-gray-400 dark:text-gray-500 ml-2">
                  {new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(t.amount)}
                </span>
              </CommandItem>
            ))}
          </CommandGroup>
        )}

        <CommandGroup heading="Go to">
          <CommandItem value="dashboard" onSelect={() => go("/dashboard")}>
            <LayoutDashboard className="mr-2 h-4 w-4" /> Dashboard
            <CommandShortcut>g d</CommandShortcut>
          </CommandItem>
          <CommandItem value="ask" onSelect={() => go("/ask")}>
            <Sparkles className="mr-2 h-4 w-4" /> Ask (AI)
          </CommandItem>
          <CommandItem value="transactions" onSelect={() => go("/transactions")}>
            <ArrowUpDown className="mr-2 h-4 w-4" /> Transactions
            <CommandShortcut>g t</CommandShortcut>
          </CommandItem>
          <CommandItem value="quick entry" onSelect={() => go("/quick-entry")}>
            <Camera className="mr-2 h-4 w-4" /> Quick Entry
            <CommandShortcut>g q</CommandShortcut>
          </CommandItem>
          <CommandItem value="upload" onSelect={() => go("/upload")}>
            <Upload className="mr-2 h-4 w-4" /> Upload Statement
            <CommandShortcut>g u</CommandShortcut>
          </CommandItem>
          <CommandItem value="accounts" onSelect={() => go("/accounts")}>
            <Wallet className="mr-2 h-4 w-4" /> Accounts
            <CommandShortcut>g a</CommandShortcut>
          </CommandItem>
          <CommandItem value="categories" onSelect={() => go("/categories")}>
            <Tags className="mr-2 h-4 w-4" /> Categories
            <CommandShortcut>g c</CommandShortcut>
          </CommandItem>
          <CommandItem value="goals" onSelect={() => go("/goals")}>
            <Target className="mr-2 h-4 w-4" /> Goals
            <CommandShortcut>g g</CommandShortcut>
          </CommandItem>
          <CommandItem value="insights" onSelect={() => go("/insights")}>
            <TrendingUp className="mr-2 h-4 w-4" /> Insights
            <CommandShortcut>g i</CommandShortcut>
          </CommandItem>
          <CommandItem value="compare months" onSelect={() => go("/compare")}>
            <ArrowLeftRight className="mr-2 h-4 w-4" /> Compare months
          </CommandItem>
          <CommandItem value="settings" onSelect={() => go("/settings")}>
            <Settings className="mr-2 h-4 w-4" /> Settings
            <CommandShortcut>g s</CommandShortcut>
          </CommandItem>
        </CommandGroup>

        <CommandSeparator />

        <CommandGroup heading="Quick actions">
          <CommandItem value="uncategorized" onSelect={() => go("/transactions?uncategorized=true")}>
            <Sparkles className="mr-2 h-4 w-4" /> View uncategorized transactions
          </CommandItem>
          <CommandItem value="pending" onSelect={() => go("/transactions?status=pending")}>
            <Sparkles className="mr-2 h-4 w-4" /> View pending transactions
          </CommandItem>
          <CommandItem value="new category" onSelect={() => go("/categories")}>
            <Plus className="mr-2 h-4 w-4" /> New category…
          </CommandItem>
          <CommandItem
            value="help shortcuts keyboard tips"
            onSelect={() => {
              setOpen(false);
              window.dispatchEvent(new Event("help:open"));
            }}
          >
            <Keyboard className="mr-2 h-4 w-4" /> Keyboard shortcuts &amp; tips
            <CommandShortcut>?</CommandShortcut>
          </CommandItem>
        </CommandGroup>

        {categories.length > 0 && (
          <>
            <CommandSeparator />
            <CommandGroup heading="Filter by category">
              {categories.map((c) => (
                <CommandItem
                  key={c.id}
                  value={`filter-${c.name}`}
                  onSelect={() => go(`/transactions?categoryId=${c.id}`)}
                >
                  <span
                    className="mr-2 inline-block w-2.5 h-2.5 rounded-full"
                    style={{ backgroundColor: c.color }}
                  />
                  {c.name}
                </CommandItem>
              ))}
            </CommandGroup>
          </>
        )}
      </CommandList>
    </CommandDialog>
  );
}
