import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getHouseholdAccountIds } from "@/lib/household";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ name: string }> },
) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { name: raw } = await params;
  const name = decodeURIComponent(raw);

  const householdAccountIds = await getHouseholdAccountIds(session.user.id);

  // Match on normalized merchant OR original description — so merchant drill
  // works both pre- and post-normalization.
  const transactions = await prisma.transaction.findMany({
    where: {
      accountId: { in: householdAccountIds },
      OR: [
        { merchant: name },
        { description: { contains: name, mode: "insensitive" } },
      ],
    },
    include: {
      account: { select: { id: true, name: true, type: true } },
      category: { select: { id: true, name: true, color: true } },
    },
    orderBy: { date: "desc" },
    take: 500,
  });

  if (transactions.length === 0) {
    return NextResponse.json({
      merchant: name,
      total: 0,
      count: 0,
      avg: 0,
      firstSeen: null,
      lastSeen: null,
      monthly: [],
      categories: [],
      accounts: [],
      transactions: [],
    });
  }

  // Aggregates — only count debits toward spending totals; credits (refunds,
  // reversals) show up separately in the list but shouldn't inflate averages.
  const debits = transactions.filter((t) => !t.isCredit);
  const total = debits.reduce((s, t) => s + t.amount, 0);
  const avg = debits.length > 0 ? total / debits.length : 0;

  const dates = transactions.map((t) => t.date.getTime());
  const firstSeen = new Date(Math.min(...dates)).toISOString();
  const lastSeen = new Date(Math.max(...dates)).toISOString();

  // Monthly totals (debits only)
  const monthlyMap = new Map<string, number>();
  for (const t of debits) {
    const key = `${t.date.getFullYear()}-${String(t.date.getMonth() + 1).padStart(2, "0")}`;
    monthlyMap.set(key, (monthlyMap.get(key) ?? 0) + t.amount);
  }
  const monthly = Array.from(monthlyMap, ([month, amount]) => ({ month, amount })).sort((a, b) =>
    a.month.localeCompare(b.month),
  );

  // Category mix (debits only)
  const categoryMap = new Map<string, { name: string; color: string; amount: number; count: number }>();
  for (const t of debits) {
    const catName = t.category?.name ?? "Uncategorized";
    const catColor = t.category?.color ?? "#9ca3af";
    const prev = categoryMap.get(catName) ?? { name: catName, color: catColor, amount: 0, count: 0 };
    prev.amount += t.amount;
    prev.count += 1;
    categoryMap.set(catName, prev);
  }
  const categories = Array.from(categoryMap.values()).sort((a, b) => b.amount - a.amount);

  // Account breakdown (debits only)
  const accountMap = new Map<string, { id: string; name: string; amount: number; count: number }>();
  for (const t of debits) {
    const prev = accountMap.get(t.accountId) ?? {
      id: t.accountId,
      name: t.account.name,
      amount: 0,
      count: 0,
    };
    prev.amount += t.amount;
    prev.count += 1;
    accountMap.set(t.accountId, prev);
  }
  const accounts = Array.from(accountMap.values()).sort((a, b) => b.amount - a.amount);

  return NextResponse.json({
    merchant: name,
    total,
    count: debits.length,
    avg,
    firstSeen,
    lastSeen,
    monthly,
    categories,
    accounts,
    transactions: transactions.slice(0, 100).map((t) => ({
      id: t.id,
      date: t.date,
      description: t.description,
      merchant: t.merchant,
      amount: t.amount,
      isCredit: t.isCredit,
      account: t.account,
      category: t.category,
    })),
  });
}
