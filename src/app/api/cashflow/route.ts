import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getPartnerUserId } from "@/lib/household";

type Cadence = "weekly" | "biweekly" | "monthly" | "quarterly" | "annual";

function detectCadence(dates: Date[]): { cadence: Cadence | null; intervalDays: number } {
  if (dates.length < 2) return { cadence: null, intervalDays: 30 };
  const sorted = [...dates].sort((a, b) => a.getTime() - b.getTime());
  const intervals: number[] = [];
  for (let i = 1; i < sorted.length; i++) {
    intervals.push((sorted[i].getTime() - sorted[i - 1].getTime()) / 86_400_000);
  }
  intervals.sort((a, b) => a - b);
  const median = intervals[Math.floor(intervals.length / 2)];
  if (median <= 10) return { cadence: "weekly", intervalDays: 7 };
  if (median <= 20) return { cadence: "biweekly", intervalDays: 14 };
  if (median <= 50) return { cadence: "monthly", intervalDays: 30 };
  if (median <= 120) return { cadence: "quarterly", intervalDays: 91 };
  if (median <= 400) return { cadence: "annual", intervalDays: 365 };
  return { cadence: null, intervalDays: median };
}

export interface CashFlowEvent {
  type: "bill" | "income" | "debit" | "credit";
  label: string;
  amount: number;
  categoryName: string | null;
  categoryColor: string | null;
  isProjected: boolean;
}

export interface CashFlowDay {
  date: string;
  balance: number;
  isProjected: boolean;
  events: CashFlowEvent[];
}

export async function GET(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const userId = session.user.id;
  const partnerUserId = await getPartnerUserId(userId);
  const userIds = partnerUserId ? [userId, partnerUserId] : [userId];

  const url = new URL(request.url);
  const now = new Date();
  const year = parseInt(url.searchParams.get("year") ?? String(now.getFullYear()));
  const month = parseInt(url.searchParams.get("month") ?? String(now.getMonth() + 1));

  // Calendar grid: Sunday-aligned, 6 weeks covering the requested month
  const monthStart = new Date(year, month - 1, 1);
  const gridStart = new Date(monthStart);
  gridStart.setDate(gridStart.getDate() - gridStart.getDay()); // rewind to Sunday
  gridStart.setHours(0, 0, 0, 0);
  const gridEnd = new Date(gridStart);
  gridEnd.setDate(gridEnd.getDate() + 41); // 6 weeks

  const accounts = await prisma.account.findMany({
    where: { userId: { in: userIds } },
    select: { id: true, openingBalance: true },
  });
  const accountIds = accounts.map((a) => a.id);
  if (accountIds.length === 0) return NextResponse.json({ days: [], currentBalance: 0 });

  const openingAnchors = accounts.reduce((s, a) => s + (a.openingBalance ?? 0), 0);

  // Balance at the start of the grid (all transactions before gridStart)
  const preGrid = await prisma.transaction.groupBy({
    by: ["isCredit"],
    where: { accountId: { in: accountIds }, date: { lt: gridStart }, deletedAt: null, isExcluded: false },
    _sum: { amount: true },
  });
  const balanceAtGridStart = openingAnchors + preGrid.reduce(
    (s, r) => s + (r.isCredit ? (r._sum.amount ?? 0) : -(r._sum.amount ?? 0)),
    0,
  );

  // Actual transactions in the grid window
  const actualTx = await prisma.transaction.findMany({
    where: {
      accountId: { in: accountIds },
      date: { gte: gridStart, lte: gridEnd },
      deletedAt: null,
      isExcluded: false,
      transferPairId: null,
    },
    select: {
      date: true,
      amount: true,
      isCredit: true,
      merchant: true,
      description: true,
      category: { select: { name: true, color: true } },
    },
    orderBy: { date: "asc" },
  });

  // Group by day
  type TxRow = typeof actualTx[0];
  const actualByDay = new Map<string, TxRow[]>();
  for (const tx of actualTx) {
    const key = tx.date.toISOString().slice(0, 10);
    if (!actualByDay.has(key)) actualByDay.set(key, []);
    actualByDay.get(key)!.push(tx);
  }

  // Subscription detection: look back 6 months for recurring patterns
  const sixMonthsAgo = new Date(now);
  sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);

  const subTx = await prisma.transaction.findMany({
    where: {
      accountId: { in: accountIds },
      isCredit: false,
      deletedAt: null,
      isExcluded: false,
      transferPairId: null,
      date: { gte: sixMonthsAgo },
    },
    select: {
      amount: true,
      date: true,
      merchant: true,
      description: true,
      category: { select: { name: true, color: true } },
    },
    orderBy: { date: "asc" },
  });

  type SubEntry = { amounts: number[]; dates: Date[]; categoryName: string | null; categoryColor: string | null };
  const subMap: Record<string, SubEntry> = {};
  for (const tx of subTx) {
    const name = tx.merchant ?? tx.description;
    if (!subMap[name]) subMap[name] = { amounts: [], dates: [], categoryName: null, categoryColor: null };
    subMap[name].amounts.push(tx.amount);
    subMap[name].dates.push(tx.date);
    subMap[name].categoryName = tx.category?.name ?? null;
    subMap[name].categoryColor = tx.category?.color ?? null;
  }

  // Project subscriptions into future days within gridEnd
  const projectedByDay = new Map<string, CashFlowEvent[]>();
  function addProjected(dateKey: string, event: CashFlowEvent) {
    if (!projectedByDay.has(dateKey)) projectedByDay.set(dateKey, []);
    projectedByDay.get(dateKey)!.push(event);
  }

  const todayStr = now.toISOString().slice(0, 10);

  for (const [name, data] of Object.entries(subMap)) {
    if (data.dates.length < 2) continue;
    const avg = data.amounts.reduce((a, b) => a + b, 0) / data.amounts.length;
    const consistent = data.amounts.every((a) => Math.abs(a - avg) / Math.max(avg, 1) <= 0.2);
    if (!consistent) continue;
    const { cadence, intervalDays } = detectCadence(data.dates);
    if (!cadence) continue;

    const sorted = [...data.dates].sort((a, b) => a.getTime() - b.getTime());
    const lastDate = sorted[sorted.length - 1];
    let nextDate = new Date(lastDate.getTime() + intervalDays * 86_400_000);

    // Walk forward until past grid end
    while (nextDate <= gridEnd) {
      const key = nextDate.toISOString().slice(0, 10);
      if (key > todayStr) {
        addProjected(key, {
          type: "bill",
          label: name,
          amount: Math.round(avg * 100) / 100,
          categoryName: data.categoryName,
          categoryColor: data.categoryColor,
          isProjected: true,
        });
      }
      // Advance by cadence
      if (cadence === "monthly") {
        nextDate = new Date(nextDate);
        nextDate.setMonth(nextDate.getMonth() + 1);
      } else {
        nextDate = new Date(nextDate.getTime() + intervalDays * 86_400_000);
      }
    }
  }

  // Payday detection: large credits on consistent day-of-month
  const incomeTx = await prisma.transaction.findMany({
    where: {
      accountId: { in: accountIds },
      isCredit: true,
      deletedAt: null,
      transferPairId: null,
      date: { gte: sixMonthsAgo },
    },
    select: { amount: true, date: true },
    orderBy: { date: "asc" },
  });

  // Find median credit amount, consider anything >= 50th percentile as "income"
  const creditAmounts = incomeTx.map((t) => t.amount).sort((a, b) => a - b);
  const p50 = creditAmounts[Math.floor(creditAmounts.length * 0.5)] ?? 0;
  const incomeOnly = incomeTx.filter((t) => t.amount >= Math.max(p50, 100));

  // Group by day-of-month
  const domCounts: Record<number, { total: number; count: number; months: Set<string> }> = {};
  for (const tx of incomeOnly) {
    const dom = tx.date.getDate();
    const mKey = `${tx.date.getFullYear()}-${tx.date.getMonth()}`;
    if (!domCounts[dom]) domCounts[dom] = { total: 0, count: 0, months: new Set() };
    domCounts[dom].total += tx.amount;
    domCounts[dom].count += 1;
    domCounts[dom].months.add(mKey);
  }
  // Paydays: dom that appears in 2+ distinct months
  const paydays = Object.entries(domCounts)
    .filter(([, v]) => v.months.size >= 2)
    .map(([dom, v]) => ({ dom: parseInt(dom), avgAmount: v.total / v.count }));

  // Project payday income into future grid days
  for (const { dom, avgAmount } of paydays) {
    // Check this month and next month
    for (let mo = 0; mo <= 2; mo++) {
      // Clamp dom to last day of the target month (e.g. day 31 in Feb → Feb 28)
      const daysInMonth = new Date(year, month - 1 + mo + 1, 0).getDate();
      const clampedDom = Math.min(dom, daysInMonth);
      const d = new Date(year, month - 1 + mo, clampedDom);
      if (d < gridStart || d > gridEnd) continue;
      const key = d.toISOString().slice(0, 10);
      if (key <= todayStr) continue;
      addProjected(key, {
        type: "income",
        label: "Paycheck",
        amount: Math.round(avgAmount * 100) / 100,
        categoryName: null,
        categoryColor: null,
        isProjected: true,
      });
    }
  }

  // Build the day series
  let running = balanceAtGridStart;
  const days: CashFlowDay[] = [];

  for (let i = 0; i <= 41; i++) {
    const d = new Date(gridStart);
    d.setDate(d.getDate() + i);
    const key = d.toISOString().slice(0, 10);
    const isProjected = key > todayStr;
    const events: CashFlowEvent[] = [];

    if (!isProjected) {
      for (const tx of actualByDay.get(key) ?? []) {
        const delta = tx.isCredit ? tx.amount : -tx.amount;
        running += delta;
        events.push({
          type: tx.isCredit ? "credit" : "debit",
          label: tx.merchant ?? tx.description,
          amount: tx.amount,
          categoryName: tx.category?.name ?? null,
          categoryColor: tx.category?.color ?? null,
          isProjected: false,
        });
      }
    } else {
      for (const ev of projectedByDay.get(key) ?? []) {
        running += ev.type === "income" ? ev.amount : -ev.amount;
        events.push(ev);
      }
    }

    days.push({ date: key, balance: Math.round(running * 100) / 100, isProjected, events });
  }

  // Compute current balance (end-of-today)
  const todayIdx = days.findIndex((d) => d.date === todayStr);
  const currentBalance = todayIdx >= 0 ? days[todayIdx].balance : running;

  return NextResponse.json({ days, currentBalance });
}
