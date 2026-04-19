"use client";

import { useRef } from "react";
import { format, subDays } from "date-fns";
import { Search, Filter, Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { Account, Category } from "./types";

export type StatusFilter = "all" | "pending" | "posted";

export interface FilterState {
  searchInput: string;
  search: string;
  filterAccount: string;
  filterCategory: string;
  filterUncategorized: boolean;
  statusFilter: StatusFilter;
  from: string;
  to: string;
}

interface Props {
  accounts: Account[];
  categories: Category[];
  filters: FilterState;
  onFilterChange: (next: Partial<FilterState>) => void;
  onResetPage: () => void;
  onExport: () => void;
  exporting: boolean;
  disableExport: boolean;
}

// Filter bar: search (with operator support), account / category selects,
// uncategorized-only toggle, status pills, date range + quick chips, export.
export function TransactionsFilters({
  accounts,
  categories,
  filters,
  onFilterChange,
  onResetPage,
  onExport,
  exporting,
  disableExport,
}: Props) {
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  function handleSearchInput(value: string) {
    onFilterChange({ searchInput: value });
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      onFilterChange({ search: value });
      onResetPage();
    }, 250);
  }

  const hasActiveFilter =
    filters.searchInput ||
    filters.filterAccount !== "all" ||
    filters.filterCategory !== "all" ||
    filters.filterUncategorized ||
    filters.from ||
    filters.to;

  return (
    <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-4 space-y-3">
      <div className="flex items-center gap-2 text-sm font-medium text-gray-700 dark:text-gray-200">
        <Filter className="w-4 h-4" /> Filters
      </div>
      <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
        <div className="relative col-span-1 md:col-span-1 w-full">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 dark:text-gray-500" />
          <Input
            value={filters.searchInput}
            onChange={(e) => handleSearchInput(e.target.value)}
            placeholder="Search or amount:>100 category:dining"
            className="pl-9 w-full"
            title="Operators: amount:>100, amount:50-150, category:dining, merchant:amazon, account:chase, from:2026-01-01, to:2026-03-31"
          />
        </div>
        <Select
          value={filters.filterAccount}
          onValueChange={(v) => {
            onFilterChange({ filterAccount: v ?? "all" });
            onResetPage();
          }}
        >
          <SelectTrigger>
            <SelectValue>
              {filters.filterAccount === "all"
                ? "All accounts"
                : accounts.find((a) => a.id === filters.filterAccount)?.name ?? "All accounts"}
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All accounts</SelectItem>
            {accounts.map((a) => (
              <SelectItem key={a.id} value={a.id}>
                {a.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select
          value={filters.filterCategory}
          onValueChange={(v) => {
            onFilterChange({ filterCategory: v ?? "all" });
            onResetPage();
          }}
        >
          <SelectTrigger>
            <SelectValue>
              {filters.filterCategory === "all"
                ? "All categories"
                : categories.find((c) => c.id === filters.filterCategory)?.name ?? "All categories"}
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All categories</SelectItem>
            {categories.map((c) => (
              <SelectItem key={c.id} value={c.id}>
                {c.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button
          variant={filters.filterUncategorized ? "default" : "outline"}
          size="sm"
          onClick={() => {
            onFilterChange({ filterUncategorized: !filters.filterUncategorized });
            onResetPage();
          }}
          className="h-10"
        >
          Uncategorized only
        </Button>
      </div>

      <div className="flex items-center gap-1.5">
        <span className="text-xs text-gray-500 dark:text-gray-400 font-medium mr-1">Show:</span>
        {(["all", "posted", "pending"] as const).map((s) => (
          <button
            key={s}
            onClick={() => {
              onFilterChange({ statusFilter: s });
              onResetPage();
            }}
            className={`px-3 py-1 text-xs rounded-full font-medium transition-colors ${
              filters.statusFilter === s
                ? s === "pending"
                  ? "bg-amber-100 text-amber-700"
                  : "bg-gray-900 text-white"
                : "bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400 hover:bg-gray-200"
            }`}
          >
            {s.charAt(0).toUpperCase() + s.slice(1)}
          </button>
        ))}
      </div>

      <div className="flex gap-3 items-end flex-wrap">
        <div className="space-y-1">
          <Label className="text-xs">From</Label>
          <Input
            type="date"
            value={filters.from}
            onChange={(e) => {
              onFilterChange({ from: e.target.value });
              onResetPage();
            }}
            className="h-8 text-sm"
          />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">To</Label>
          <Input
            type="date"
            value={filters.to}
            onChange={(e) => {
              onFilterChange({ to: e.target.value });
              onResetPage();
            }}
            className="h-8 text-sm"
          />
        </div>
        <div className="flex items-center gap-1.5 flex-wrap pb-0.5">
          {([
            { label: "7d", days: 7 },
            { label: "30d", days: 30 },
            { label: "90d", days: 90 },
          ] as const).map((chip) => (
            <button
              key={chip.label}
              type="button"
              onClick={() => {
                const today = new Date();
                const start = subDays(today, chip.days);
                onFilterChange({ from: format(start, "yyyy-MM-dd"), to: format(today, "yyyy-MM-dd") });
                onResetPage();
              }}
              className="px-2.5 py-1 text-xs rounded-full font-medium bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700"
            >
              {chip.label}
            </button>
          ))}
          <button
            type="button"
            onClick={() => {
              const now = new Date();
              const start = new Date(now.getFullYear(), now.getMonth(), 1);
              onFilterChange({ from: format(start, "yyyy-MM-dd"), to: format(now, "yyyy-MM-dd") });
              onResetPage();
            }}
            className="px-2.5 py-1 text-xs rounded-full font-medium bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700"
          >
            This month
          </button>
          <button
            type="button"
            onClick={() => {
              const now = new Date();
              const start = new Date(now.getFullYear(), now.getMonth() - 1, 1);
              const end = new Date(now.getFullYear(), now.getMonth(), 0);
              onFilterChange({ from: format(start, "yyyy-MM-dd"), to: format(end, "yyyy-MM-dd") });
              onResetPage();
            }}
            className="px-2.5 py-1 text-xs rounded-full font-medium bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700"
          >
            Last month
          </button>
        </div>
        {hasActiveFilter && (
          <Button
            variant="ghost"
            size="sm"
            className="h-8 text-gray-400 dark:text-gray-500"
            onClick={() => {
              onFilterChange({
                searchInput: "",
                search: "",
                filterAccount: "all",
                filterCategory: "all",
                filterUncategorized: false,
                from: "",
                to: "",
              });
              onResetPage();
            }}
          >
            Clear filters
          </Button>
        )}
        <Button
          variant="outline"
          size="sm"
          className="h-8 ml-auto"
          onClick={onExport}
          disabled={exporting || disableExport}
          title="Download current filtered view as CSV"
        >
          <Download className="w-3.5 h-3.5 mr-1.5" />
          {exporting ? "Exporting..." : "Export CSV"}
        </Button>
      </div>
    </div>
  );
}
