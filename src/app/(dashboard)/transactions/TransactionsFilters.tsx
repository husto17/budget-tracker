"use client";

import { useRef, useState } from "react";
import { format, subDays } from "date-fns";
import { Search, Filter, Download, ArrowUpDown, ChevronDown, ChevronUp } from "lucide-react";
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
  sort: "asc" | "desc";
  sortBy: "date" | "amount";
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
  const [mobileExpanded, setMobileExpanded] = useState(false);

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
    filters.statusFilter !== "all" ||
    filters.from ||
    filters.to;

  const activeCount = [
    filters.searchInput,
    filters.filterAccount !== "all",
    filters.filterCategory !== "all",
    filters.filterUncategorized,
    filters.statusFilter !== "all",
    filters.from,
    filters.to,
  ].filter(Boolean).length;

  return (
    <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-4 space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm font-medium text-gray-700 dark:text-gray-200">
          <Filter className="w-4 h-4" /> Filters
          {activeCount > 0 && (
            <span className="inline-flex items-center justify-center w-4 h-4 text-[10px] font-bold rounded-full bg-indigo-600 text-white">
              {activeCount}
            </span>
          )}
        </div>
        <button
          type="button"
          onClick={() => setMobileExpanded((v) => !v)}
          className="md:hidden flex items-center gap-1 text-xs text-gray-500 dark:text-gray-400"
        >
          {mobileExpanded ? <><ChevronUp className="w-3.5 h-3.5" /> Hide</> : <><ChevronDown className="w-3.5 h-3.5" /> Show</>}
        </button>
      </div>

      <div className={`${mobileExpanded ? "block" : "hidden"} md:block space-y-3`}>
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
            onFilterChange({ filterCategory: v ?? "all", filterUncategorized: false });
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
            onFilterChange({
              filterUncategorized: !filters.filterUncategorized,
              filterCategory: "all",
            });
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
          ] as const).map((chip) => {
            const today = new Date();
            const start = subDays(today, chip.days);
            const active = filters.from === format(start, "yyyy-MM-dd") && filters.to === format(today, "yyyy-MM-dd");
            return (
              <button
                key={chip.label}
                type="button"
                onClick={() => {
                  onFilterChange({ from: format(start, "yyyy-MM-dd"), to: format(today, "yyyy-MM-dd") });
                  onResetPage();
                }}
                className={`px-2.5 py-1 text-xs rounded-full font-medium transition-colors ${active ? "bg-gray-900 dark:bg-gray-100 text-white dark:text-gray-900" : "bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700"}`}
              >
                {chip.label}
              </button>
            );
          })}
          {(() => {
            const now = new Date();
            const start = new Date(now.getFullYear(), now.getMonth(), 1);
            const active = filters.from === format(start, "yyyy-MM-dd") && filters.to === format(now, "yyyy-MM-dd");
            return (
              <button
                type="button"
                onClick={() => {
                  onFilterChange({ from: format(start, "yyyy-MM-dd"), to: format(now, "yyyy-MM-dd") });
                  onResetPage();
                }}
                className={`px-2.5 py-1 text-xs rounded-full font-medium transition-colors ${active ? "bg-gray-900 dark:bg-gray-100 text-white dark:text-gray-900" : "bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700"}`}
              >
                This month
              </button>
            );
          })()}
          {(() => {
            const now = new Date();
            const start = new Date(now.getFullYear(), now.getMonth() - 1, 1);
            const end = new Date(now.getFullYear(), now.getMonth(), 0);
            const active = filters.from === format(start, "yyyy-MM-dd") && filters.to === format(end, "yyyy-MM-dd");
            return (
              <button
                type="button"
                onClick={() => {
                  onFilterChange({ from: format(start, "yyyy-MM-dd"), to: format(end, "yyyy-MM-dd") });
                  onResetPage();
                }}
                className={`px-2.5 py-1 text-xs rounded-full font-medium transition-colors ${active ? "bg-gray-900 dark:bg-gray-100 text-white dark:text-gray-900" : "bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700"}`}
              >
                Last month
              </button>
            );
          })()}
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
                statusFilter: "all",
                from: "",
                to: "",
                sort: "desc",
                sortBy: "date",
              });
              onResetPage();
            }}
          >
            Clear filters
          </Button>
        )}
        <div className="flex items-center gap-2 ml-auto">
          <select
            value={`${filters.sortBy ?? "date"}-${filters.sort}`}
            onChange={(e) => {
              const [field, dir] = e.target.value.split("-") as ["date" | "amount", "asc" | "desc"];
              onFilterChange({ sortBy: field, sort: dir });
              onResetPage();
            }}
            className="text-xs h-8 px-2 pr-6 rounded-md border border-gray-200 dark:border-gray-700 bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 focus:outline-none cursor-pointer"
          >
            <option value="date-desc">Newest first</option>
            <option value="date-asc">Oldest first</option>
            <option value="amount-desc">Highest amount</option>
            <option value="amount-asc">Lowest amount</option>
          </select>
          <Button
            variant="outline"
            size="sm"
            className="h-8"
            onClick={onExport}
            disabled={exporting || disableExport}
            title="Download current filtered view as CSV"
          >
            <Download className="w-3.5 h-3.5 mr-1.5" />
            {exporting ? "Exporting..." : "Export CSV"}
          </Button>
        </div>
      </div>
      </div>
    </div>
  );
}
