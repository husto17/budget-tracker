"use client";

import { format } from "date-fns";
import Link from "next/link";
import {
  ArrowRightLeft,
  ChevronDown,
  ChevronRight,
  Link2,
  Pencil,
  Scissors,
  Trash2,
  Unlink,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { CategoryIcon } from "@/components/ui/category-icon";
import { formatCurrency } from "@/lib/fetcher";
import type { Category, Transaction } from "./types";
import { netOfReimbursements } from "./types";

export interface RowActions {
  onToggleSelect: (id: string) => void;
  onTogglePairSelect: (a: string, b: string) => void;
  onTogglePairExpanded: (pairKey: string) => void;
  onOpenDrawer: (tx: Transaction) => void;
  onUpdateCategory: (id: string, categoryId: string | null) => void;
  onOpenEdit: (tx: Transaction) => void;
  onOpenSplit: (tx: Transaction) => void;
  onLinkTransfer: (tx: Transaction) => void;
  onUnlinkTransfer: (id: string) => void;
  onRequestDelete: (id: string) => void;
}

export interface PairInfo {
  pairKey: string;
  isFirst: boolean;
  other: Transaction;
}

interface BaseProps {
  tx: Transaction;
  info: PairInfo | undefined;
  isExpanded: boolean;
  isSelected: boolean;
  categories: Category[];
  actions: RowActions;
}

function pairMeta(tx: Transaction, info: PairInfo) {
  const other = info.other;
  const outgoing = tx.isCredit ? other : tx;
  const incoming = tx.isCredit ? tx : other;
  const isCreditCardPayment =
    outgoing.account.type === "CREDIT_CARD" || incoming.account.type === "CREDIT_CARD";
  return {
    outgoing,
    incoming,
    label: isCreditCardPayment ? "Credit card payment" : "Transfer",
  };
}

// ============================================================================
// DESKTOP row (table <tr>) + pair header
// ============================================================================
export function TransactionRow({
  tx,
  info,
  isExpanded,
  isSelected,
  categories,
  actions,
  bothPairSelected,
}: BaseProps & { bothPairSelected: boolean }) {
  const isFirstOfPair = !!info?.isFirst;
  const showNormalRow = !info || isExpanded;

  let pairHeader: React.ReactNode = null;
  if (isFirstOfPair && info) {
    const { outgoing, incoming, label } = pairMeta(tx, info);
    pairHeader = (
      <tr
        key={`pair-${info.pairKey}`}
        className="bg-blue-50/40 dark:bg-indigo-950/20 hover:bg-blue-50/60 dark:hover:bg-indigo-950/30 transition-colors"
      >
        <td className="px-4 py-3">
          <input
            type="checkbox"
            checked={bothPairSelected}
            onChange={() => actions.onTogglePairSelect(tx.id, info.other.id)}
          />
        </td>
        <td className="px-4 py-3 text-sm text-gray-500 dark:text-gray-400 whitespace-nowrap">
          {format(new Date(outgoing.date), "dd MMM yyyy")}
        </td>
        <td className="px-4 py-3">
          <div className="flex items-center gap-2">
            <button
              onClick={() => actions.onTogglePairExpanded(info.pairKey)}
              className="text-gray-400 dark:text-gray-500 hover:text-gray-700 dark:hover:text-gray-200"
              title={isExpanded ? "Collapse" : "Expand"}
            >
              {isExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
            </button>
            <ArrowRightLeft className="w-4 h-4 text-blue-500 shrink-0" />
            <div className="min-w-0">
              <p className="text-sm font-medium text-gray-900 dark:text-gray-100">{label}</p>
              <p className="text-xs text-gray-500 dark:text-gray-400 truncate max-w-[240px]">
                {outgoing.account.name} → {incoming.account.name}
              </p>
            </div>
          </div>
        </td>
        <td className="px-4 py-3 text-sm text-gray-400 dark:text-gray-500">—</td>
        <td className="px-4 py-3">
          <Badge variant="outline" className="text-xs text-blue-600 border-blue-200 gap-1">
            <ArrowRightLeft className="w-3 h-3" /> Transfer
          </Badge>
        </td>
        <td className="px-4 py-3 text-right whitespace-nowrap">
          <span className="text-sm font-medium text-gray-700 dark:text-gray-200">
            {formatCurrency(outgoing.amount)}
          </span>
        </td>
        <td className="px-4 py-3 text-right">
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 text-blue-400 hover:text-red-500"
            title="Unlink transfer"
            onClick={() => actions.onUnlinkTransfer(outgoing.id)}
          >
            <Unlink className="w-3.5 h-3.5" />
          </Button>
        </td>
      </tr>
    );
  }

  if (!showNormalRow) return <>{pairHeader}</>;

  const { net, offset } = netOfReimbursements(tx);

  return (
    <>
      {pairHeader}
      <tr
        className={`hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors ${
          isSelected ? "bg-blue-50 dark:bg-indigo-950/40" : ""
        } ${tx.isPending ? "opacity-80" : ""} ${info ? "bg-blue-50/10 dark:bg-indigo-950/10" : ""}`}
      >
        <td className="px-4 py-3">
          <input
            type="checkbox"
            checked={isSelected}
            onChange={() => actions.onToggleSelect(tx.id)}
            aria-label={`Select ${tx.merchant ?? tx.description}`}
          />
        </td>
        <td className="px-4 py-3 text-sm text-gray-500 dark:text-gray-400 whitespace-nowrap">
          {format(new Date(tx.date), "dd MMM yyyy")}
        </td>
        <td className="px-4 py-3">
          <div className="flex items-center gap-2 flex-wrap">
            <div>
              <Link
                href={`/merchants/${encodeURIComponent(tx.merchant ?? tx.description)}`}
                onClick={(e) => {
                  // Primary click → drawer; ⌘-click or middle-click → merchant page.
                  if (!(e.metaKey || e.ctrlKey || e.button === 1)) {
                    e.preventDefault();
                    actions.onOpenDrawer(tx);
                  }
                }}
                className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate max-w-[200px] text-left hover:text-blue-600 transition-colors"
              >
                {tx.merchant ?? tx.description}
              </Link>
              {tx.merchant && tx.merchant !== tx.description && (
                <p className="text-xs text-gray-400 dark:text-gray-500 truncate max-w-[200px]">
                  {tx.description}
                </p>
              )}
            </div>
            {tx.isPending && !tx.isReconciled && (
              <Badge className="text-xs bg-amber-100 text-amber-700 border-amber-200 hover:bg-amber-100 shrink-0">
                Pending
              </Badge>
            )}
            {tx.isReconciled && (
              <Badge className="text-xs bg-green-100 text-green-700 border-green-200 hover:bg-green-100 shrink-0">
                Reconciled
              </Badge>
            )}
            {tx.transferPairId ? (
              <Badge
                variant="outline"
                className="text-xs text-blue-500 gap-1 shrink-0 cursor-pointer hover:bg-blue-50 dark:hover:bg-indigo-950/40"
                onClick={() => actions.onUnlinkTransfer(tx.id)}
                title="Click to unlink transfer"
              >
                <ArrowRightLeft className="w-3 h-3" />
                Transfer
              </Badge>
            ) : (
              <button
                className="opacity-0 group-hover:opacity-100 text-xs text-gray-400 dark:text-gray-500 hover:text-blue-600 flex items-center gap-1 transition-opacity"
                onClick={() => actions.onLinkTransfer(tx)}
                title="Link as transfer"
              >
                <Link2 className="w-3 h-3" />
              </button>
            )}
          </div>
        </td>
        <td className="px-4 py-3 text-sm text-gray-500 dark:text-gray-400 whitespace-nowrap">
          {tx.account.name}
        </td>
        <td className="px-4 py-3">
          {tx.splits && tx.splits.length > 0 ? (
            <button
              onClick={() => actions.onOpenSplit(tx)}
              className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded-full bg-purple-50 text-purple-700 border border-purple-200 hover:bg-purple-100 transition-colors"
            >
              <Scissors className="w-3 h-3" /> Split ({tx.splits.length})
            </button>
          ) : (
            <Select
              value={tx.category?.id ?? "none"}
              onValueChange={(v) => actions.onUpdateCategory(tx.id, v === "none" ? null : v)}
            >
              <SelectTrigger className="h-7 text-xs border-0 bg-transparent p-0 gap-1 w-36 hover:bg-gray-100 dark:hover:bg-gray-800 rounded px-2">
                <div className="flex items-center gap-1.5 min-w-0">
                  {tx.category ? (
                    <>
                      <CategoryIcon icon={tx.category.icon} color={tx.category.color} size="sm" />
                      <span className="truncate">{tx.category.name}</span>
                    </>
                  ) : (
                    <span className="text-gray-300 dark:text-gray-600">— Uncategorized</span>
                  )}
                </div>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">— None</SelectItem>
                {categories.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    <div className="flex items-center gap-2">
                      <CategoryIcon icon={c.icon} color={c.color} size="sm" />
                      {c.name}
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </td>
        <td className="px-4 py-3 text-right whitespace-nowrap">
          <div className="flex flex-col items-end">
            <span
              className={`text-sm font-medium ${
                tx.isCredit ? "text-green-600" : "text-gray-900 dark:text-gray-100"
              }`}
            >
              {tx.isCredit ? "+" : "−"}
              {formatCurrency(net)}
            </span>
            {offset > 0.005 && (
              <span
                className="text-[10px] text-gray-400 dark:text-gray-500 tabular-nums line-through"
                title={`Gross ${formatCurrency(tx.amount)}, ${
                  tx.isCredit ? "applied" : "reimbursed"
                } ${formatCurrency(offset)}`}
              >
                {formatCurrency(tx.amount)}
              </span>
            )}
          </div>
        </td>
        <td className="px-4 py-3 text-right">
          <div className="flex items-center justify-end gap-1">
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 text-gray-400 dark:text-gray-500 hover:text-gray-700 dark:hover:text-gray-200"
              title="Edit transaction"
              onClick={() => actions.onOpenEdit(tx)}
            >
              <Pencil className="w-3.5 h-3.5" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 text-gray-400 dark:text-gray-500 hover:text-purple-500"
              title="Split transaction"
              onClick={() => actions.onOpenSplit(tx)}
            >
              <Scissors className="w-3.5 h-3.5" />
            </Button>
            {!tx.transferPairId && (
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 text-gray-400 dark:text-gray-500 hover:text-blue-500"
                title="Link as transfer"
                onClick={() => actions.onLinkTransfer(tx)}
              >
                <Link2 className="w-3.5 h-3.5" />
              </Button>
            )}
            {tx.transferPairId && (
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 text-blue-400 hover:text-gray-500 dark:hover:text-gray-400"
                title="Unlink transfer"
                onClick={() => actions.onUnlinkTransfer(tx.id)}
              >
                <Unlink className="w-3.5 h-3.5" />
              </Button>
            )}
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 text-gray-400 dark:text-gray-500 hover:text-red-500"
              onClick={() => actions.onRequestDelete(tx.id)}
            >
              <Trash2 className="w-3.5 h-3.5" />
            </Button>
          </div>
        </td>
      </tr>
    </>
  );
}

// ============================================================================
// MOBILE card
// ============================================================================
export function TransactionCard({
  tx,
  info,
  isExpanded,
  isSelected,
  actions,
  bothPairSelected,
}: BaseProps & { bothPairSelected: boolean }) {
  const isFirstOfPair = !!info?.isFirst;
  const showNormalRow = !info || isExpanded;

  let pairCard: React.ReactNode = null;
  if (isFirstOfPair && info) {
    const { outgoing, incoming, label } = pairMeta(tx, info);
    pairCard = (
      <div
        key={`pair-${info.pairKey}`}
        className="px-4 py-3 flex items-center gap-3 bg-blue-50/40 dark:bg-indigo-950/20"
      >
        <input
          type="checkbox"
          checked={bothPairSelected}
          onChange={() => actions.onTogglePairSelect(tx.id, info.other.id)}
          className="shrink-0"
        />
        <button
          onClick={() => actions.onTogglePairExpanded(info.pairKey)}
          className="shrink-0 text-gray-400 dark:text-gray-500"
        >
          {isExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
        </button>
        <ArrowRightLeft className="w-4 h-4 text-blue-500 shrink-0" />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-gray-900 dark:text-gray-100">{label}</p>
          <p className="text-xs text-gray-500 dark:text-gray-400 truncate">
            {outgoing.account.name} → {incoming.account.name}
          </p>
          <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">
            {format(new Date(outgoing.date), "dd MMM yyyy")}
          </p>
        </div>
        <span className="text-sm font-medium text-gray-700 dark:text-gray-200 shrink-0">
          {formatCurrency(outgoing.amount)}
        </span>
      </div>
    );
  }

  if (!showNormalRow) return <>{pairCard}</>;

  const { net, offset } = netOfReimbursements(tx);

  return (
    <>
      {pairCard}
      <div
        className={`px-4 py-3 flex items-center gap-3 ${
          isSelected ? "bg-blue-50 dark:bg-indigo-950/40" : ""
        } ${info ? "bg-blue-50/10 dark:bg-indigo-950/10 pl-8" : ""}`}
      >
        <input
          type="checkbox"
          checked={isSelected}
          onChange={() => actions.onToggleSelect(tx.id)}
          className="shrink-0"
          aria-label={`Select ${tx.merchant ?? tx.description}`}
        />
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2">
            <button
              onClick={() => actions.onOpenDrawer(tx)}
              className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate text-left hover:text-blue-600 transition-colors"
            >
              {tx.merchant ?? tx.description}
            </button>
            <div className="flex flex-col items-end shrink-0">
              <span
                className={`text-sm font-medium ${
                  tx.isCredit ? "text-green-600" : "text-gray-900 dark:text-gray-100"
                }`}
              >
                {tx.isCredit ? "+" : "−"}
                {formatCurrency(net)}
              </span>
              {offset > 0.005 && (
                <span className="text-[10px] text-gray-400 dark:text-gray-500 tabular-nums line-through">
                  {formatCurrency(tx.amount)}
                </span>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2 mt-0.5 flex-wrap">
            <span className="text-xs text-gray-400 dark:text-gray-500">
              {format(new Date(tx.date), "dd MMM yyyy")}
            </span>
            {tx.isPending && !tx.isReconciled && (
              <span className="text-xs px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700 border border-amber-200">
                Pending
              </span>
            )}
            {tx.isReconciled && (
              <span className="text-xs px-1.5 py-0.5 rounded-full bg-green-100 text-green-700 border border-green-200">
                Reconciled
              </span>
            )}
            {tx.splits && tx.splits.length > 0 ? (
              <button
                onClick={() => actions.onOpenDrawer(tx)}
                className="inline-flex items-center gap-1 text-xs px-1.5 py-0.5 rounded-full bg-purple-50 text-purple-700 border border-purple-200 hover:bg-purple-100 transition-colors"
              >
                <Scissors className="w-2.5 h-2.5" /> Split
              </button>
            ) : tx.category ? (
              <button
                onClick={() => actions.onOpenDrawer(tx)}
                className="inline-flex items-center gap-1 text-xs px-1.5 py-0.5 rounded-full hover:ring-2 hover:ring-offset-0 transition-all"
                style={{ backgroundColor: tx.category.color + "20", color: tx.category.color }}
              >
                <CategoryIcon icon={tx.category.icon} color={tx.category.color} size="sm" />
                {tx.category.name}
              </button>
            ) : (
              <button
                onClick={() => actions.onOpenDrawer(tx)}
                className="text-xs px-1.5 py-0.5 rounded-full bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
              >
                + Category
              </button>
            )}
            {tx.transferPairId ? (
              <Badge
                variant="outline"
                className="text-xs text-blue-500 gap-1 shrink-0 py-0 cursor-pointer"
                onClick={() => actions.onUnlinkTransfer(tx.id)}
              >
                <ArrowRightLeft className="w-3 h-3" /> Transfer
              </Badge>
            ) : (
              <button
                className="text-xs text-gray-400 dark:text-gray-500 hover:text-blue-600 flex items-center gap-1"
                onClick={() => actions.onLinkTransfer(tx)}
              >
                <Link2 className="w-3 h-3" /> Link
              </button>
            )}
          </div>
        </div>
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7 text-gray-400 dark:text-gray-500 hover:text-red-500 shrink-0"
          onClick={() => actions.onRequestDelete(tx.id)}
        >
          <Trash2 className="w-3.5 h-3.5" />
        </Button>
      </div>
    </>
  );
}
