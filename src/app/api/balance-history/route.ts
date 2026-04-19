import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getPartnerUserId } from "@/lib/household";

// Returns a daily end-of-day net-worth series for the signed-in user's
// household. Computed by replaying transactions forward from an anchor:
//
//   anchor = sum(accounts.openingBalance) + sum(tx_before_window)
//
// Each day in the window contributes the net of its credits/debits.
// Credit-card balances contribute negatively because card debits are charges
// (money you owe) — a purchase on a card increases debt but decreases net.
// Our debit-vs-credit accounting already handles this: a card purchase is
// `isCredit=false` (amount) → subtract from net, exactly matching "card debt
// went up by X, net worth went down by X". No special-casing needed.
export async function GET(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const userId = session.user.id;
  const partnerUserId = await getPartnerUserId(userId);
  const userIds = partnerUserId ? [userId, partnerUserId] : [userId];

  const url = new URL(request.url);
  const daysParam = parseInt(url.searchParams.get("days") ?? "180", 10);
  const days = Math.max(14, Math.min(daysParam, 730));

  const accounts = await prisma.account.findMany({
    where: { userId: { in: userIds } },
    select: { id: true, openingBalance: true },
  });
  const accountIds = accounts.map((a) => a.id);
  if (accountIds.length === 0) {
    return NextResponse.json([]);
  }

  // Start of series — midnight N days ago
  const windowStart = new Date();
  windowStart.setHours(0, 0, 0, 0);
  windowStart.setDate(windowStart.getDate() - days);

  // Manual opening-balance anchors (treated as an absolute starting point).
  const openingAnchors = accounts.reduce((s, a) => s + (a.openingBalance ?? 0), 0);

  // Net delta of tx BEFORE the window starts.
  const beforeGrouped = await prisma.transaction.groupBy({
    by: ["isCredit"],
    where: { accountId: { in: accountIds }, date: { lt: windowStart } },
    _sum: { amount: true },
  });
  const preWindowDelta = beforeGrouped.reduce(
    (s, r) => s + (r.isCredit ? (r._sum.amount ?? 0) : -(r._sum.amount ?? 0)),
    0,
  );

  // All tx in the window, summed per day.
  const inWindow = await prisma.transaction.findMany({
    where: { accountId: { in: accountIds }, date: { gte: windowStart } },
    select: { date: true, amount: true, isCredit: true },
    orderBy: { date: "asc" },
  });

  const byDay = new Map<string, number>();
  for (const t of inWindow) {
    const day = t.date.toISOString().slice(0, 10);
    const delta = t.isCredit ? t.amount : -t.amount;
    byDay.set(day, (byDay.get(day) ?? 0) + delta);
  }

  let running = openingAnchors + preWindowDelta;
  const series: Array<{ date: string; balance: number }> = [];
  for (let i = 0; i <= days; i++) {
    const d = new Date(windowStart);
    d.setDate(d.getDate() + i);
    const key = d.toISOString().slice(0, 10);
    running += byDay.get(key) ?? 0;
    series.push({ date: key, balance: Math.round(running * 100) / 100 });
  }

  return NextResponse.json(series);
}
