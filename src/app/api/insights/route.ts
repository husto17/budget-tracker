import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getHouseholdAccountIds, getPartnerUserId } from "@/lib/household";

export async function GET(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const monthsBack = Math.min(Math.max(parseInt(searchParams.get("months") ?? "6") || 6, 1), 24);

  // Optional ?month=YYYY-MM — rebase "this month / last month / upcoming bills /
  // top merchants / dailySpending" semantics onto a specific historical month
  // for the dashboard period selector and the /compare page.
  const monthParam = searchParams.get("month");
  const monthMatch = monthParam ? /^(\d{4})-(\d{2})$/.exec(monthParam) : null;
  const anchorYear = monthMatch ? parseInt(monthMatch[1]) : null;
  const anchorMonth = monthMatch ? parseInt(monthMatch[2]) - 1 : null;

  const userId = session.user.id;
  const realNow = new Date();
  // `now` acts as "this month" for the rest of the computation. When a specific
  // month is requested we pin it to the last day of that month so all the
  // month-derived keys still line up.
  const now =
    anchorYear !== null && anchorMonth !== null
      ? new Date(anchorYear, anchorMonth + 1, 0, 23, 59, 59)
      : realNow;
  const isAnchored = now.getTime() !== realNow.getTime();
  const startDate = new Date(now.getFullYear(), now.getMonth() - monthsBack, 1);

  // Get all household account IDs (own + partner's)
  const accountIds = await getHouseholdAccountIds(userId);

  // Get all spending transactions in range (debits only, exclude transfers).
  // Pending screenshot transactions ARE included — this is intentional so
  // mid-month spending tracking works. Double-counting is prevented because
  // when a statement is uploaded, the pending record is UPDATED in-place to
  // become the statement transaction (never two records for the same expense).
  const transactions = await prisma.transaction.findMany({
    where: {
      accountId: { in: accountIds },
      isCredit: false,
      date: isAnchored ? { gte: startDate, lte: now } : { gte: startDate },
      transferPairId: null,
    },
    include: {
      category: true,
      splits: { include: { category: true } },
    },
    orderBy: { date: "asc" },
  });

  // Monthly spending by category.
  // If a tx has splits, credit each split to its own category (don't double-count
  // the parent). If no splits, credit the whole amount to the tx's category.
  const monthlyByCategory: Record<string, Record<string, number>> = {};
  for (const tx of transactions) {
    const monthKey = `${tx.date.getFullYear()}-${String(tx.date.getMonth() + 1).padStart(2, "0")}`;
    if (!monthlyByCategory[monthKey]) monthlyByCategory[monthKey] = {};
    if (tx.splits.length > 0) {
      for (const s of tx.splits) {
        const catName = s.category?.name ?? "Uncategorized";
        monthlyByCategory[monthKey][catName] = (monthlyByCategory[monthKey][catName] ?? 0) + s.amount;
      }
    } else {
      const catName = tx.category?.name ?? "Uncategorized";
      monthlyByCategory[monthKey][catName] = (monthlyByCategory[monthKey][catName] ?? 0) + tx.amount;
    }
  }

  // Month-over-month total spending
  const monthlyTotals: Record<string, number> = {};
  for (const tx of transactions) {
    const monthKey = `${tx.date.getFullYear()}-${String(tx.date.getMonth() + 1).padStart(2, "0")}`;
    monthlyTotals[monthKey] = (monthlyTotals[monthKey] ?? 0) + tx.amount;
  }

  // Current month spend vs last month
  const thisMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  const lastMonthDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const lastMonth = `${lastMonthDate.getFullYear()}-${String(lastMonthDate.getMonth() + 1).padStart(2, "0")}`;
  const thisMonthTotal = monthlyTotals[thisMonth] ?? 0;
  const lastMonthTotal = monthlyTotals[lastMonth] ?? 0;
  const momChange = lastMonthTotal > 0 ? ((thisMonthTotal - lastMonthTotal) / lastMonthTotal) * 100 : 0;

  // Top spending categories this month
  const thisMonthCats = monthlyByCategory[thisMonth] ?? {};
  const topCategories = Object.entries(thisMonthCats)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 5);

  // Recurring transactions (same merchant/amount every month for 2+ months)
  const merchantMonths: Record<string, Set<string>> = {};
  for (const tx of transactions) {
    const key = `${tx.merchant ?? tx.description}|${tx.amount}`;
    const monthKey = `${tx.date.getFullYear()}-${String(tx.date.getMonth() + 1).padStart(2, "0")}`;
    if (!merchantMonths[key]) merchantMonths[key] = new Set();
    merchantMonths[key].add(monthKey);
  }
  const recurring = Object.entries(merchantMonths)
    .filter(([, months]) => months.size >= 2)
    .map(([key, months]) => {
      const [name, amountStr] = key.split("|");
      return { name, amount: parseFloat(amountStr), months: months.size };
    })
    .sort((a, b) => b.amount - a.amount)
    .slice(0, 10);

  // Subscription detection: group by merchant, find those appearing in 2+ different months
  // with similar amounts (within 10%)
  interface MerchantEntry {
    amounts: number[];
    months: Set<string>;
    lastDate: Date;
    categoryId: string | null;
    categoryName: string | null;
  }
  const merchantData: Record<string, MerchantEntry> = {};
  for (const tx of transactions) {
    const merchantName = tx.merchant ?? tx.description;
    const monthKey = `${tx.date.getFullYear()}-${String(tx.date.getMonth() + 1).padStart(2, "0")}`;
    if (!merchantData[merchantName]) {
      merchantData[merchantName] = {
        amounts: [],
        months: new Set(),
        lastDate: tx.date,
        categoryId: tx.categoryId,
        categoryName: tx.category?.name ?? null,
      };
    }
    merchantData[merchantName].amounts.push(tx.amount);
    merchantData[merchantName].months.add(monthKey);
    if (tx.date > merchantData[merchantName].lastDate) {
      merchantData[merchantName].lastDate = tx.date;
      merchantData[merchantName].categoryId = tx.categoryId;
      merchantData[merchantName].categoryName = tx.category?.name ?? null;
    }
  }

  const subscriptions = Object.entries(merchantData)
    .filter(([, data]) => {
      if (data.months.size < 2) return false;
      // Check if amounts are similar (within 10%)
      const avgAmount = data.amounts.reduce((a, b) => a + b, 0) / data.amounts.length;
      return data.amounts.every((a) => Math.abs(a - avgAmount) / avgAmount <= 0.1);
    })
    .map(([merchant, data]) => {
      const avgAmount = data.amounts.reduce((a, b) => a + b, 0) / data.amounts.length;
      return {
        merchant,
        amount: Math.round(avgAmount * 100) / 100,
        categoryId: data.categoryId,
        categoryName: data.categoryName,
        lastDate: data.lastDate.toISOString().slice(0, 10),
        monthlyCount: data.months.size,
      };
    })
    .sort((a, b) => b.amount - a.amount);

  // Anomalies: categories where this month > 150% of average
  const anomalies: Array<{ category: string; thisMonth: number; average: number; ratio: number }> = [];
  const allMonths = Object.keys(monthlyByCategory).filter((m) => m !== thisMonth);
  if (allMonths.length >= 2) {
    const allCats = new Set(Object.values(monthlyByCategory).flatMap((m) => Object.keys(m)));
    for (const cat of allCats) {
      const historical = allMonths.map((m) => monthlyByCategory[m][cat] ?? 0);
      const avg = historical.reduce((a, b) => a + b, 0) / historical.length;
      const current = thisMonthCats[cat] ?? 0;
      if (avg > 10 && current > avg * 1.5) {
        anomalies.push({ category: cat, thisMonth: current, average: avg, ratio: current / avg });
      }
    }
  }

  // Budget utilization (categories with budgets set)
  const categories = await prisma.category.findMany({
    where: { userId, monthlyBudget: { not: null } },
  });
  const budgetUtilization = categories.map((cat: typeof categories[0]) => {
    const spent = thisMonthCats[cat.name] ?? 0;
    const budget = cat.monthlyBudget!;
    return {
      category: cat.name,
      color: cat.color,
      spent,
      budget,
      remaining: budget - spent,
      pct: Math.min((spent / budget) * 100, 100),
    };
  });

  // Income vs spending by month
  const incomeTransactions = await prisma.transaction.findMany({
    where: {
      accountId: { in: accountIds },
      isCredit: true,
      date: isAnchored ? { gte: startDate, lte: now } : { gte: startDate },
      transferPairId: null,
    },
    orderBy: { date: "asc" },
  });
  const monthlyIncome: Record<string, number> = {};
  for (const tx of incomeTransactions) {
    const monthKey = `${tx.date.getFullYear()}-${String(tx.date.getMonth() + 1).padStart(2, "0")}`;
    monthlyIncome[monthKey] = (monthlyIncome[monthKey] ?? 0) + tx.amount;
  }

  const allMonthKeys = Array.from(
    new Set([...Object.keys(monthlyTotals), ...Object.keys(monthlyIncome)])
  ).sort();

  const incomeVsSpending = allMonthKeys.map((month) => ({
    month,
    income: monthlyIncome[month] ?? 0,
    spending: monthlyTotals[month] ?? 0,
    net: (monthlyIncome[month] ?? 0) - (monthlyTotals[month] ?? 0),
  }));

  // Previous month category spending (for MoM comparison per category)
  const categorySpendingPrevMonth: Record<string, number> = monthlyByCategory[lastMonth] ?? {};

  // Spending by household member
  const partnerUserId = await getPartnerUserId(userId);
  const spendingByMember: Record<string, { name: string; amount: number }> = {};

  if (partnerUserId) {
    // Get current user's name
    const currentUser = await prisma.user.findUnique({
      where: { id: userId },
      select: { name: true },
    });
    const partnerUser = await prisma.user.findUnique({
      where: { id: partnerUserId },
      select: { name: true },
    });

    // Get account IDs per user for this month
    const myAccounts = await prisma.account.findMany({
      where: { userId },
      select: { id: true },
    });
    const partnerAccounts = await prisma.account.findMany({
      where: { userId: partnerUserId },
      select: { id: true },
    });

    const myAccountIds = myAccounts.map((a) => a.id);
    const partnerAccountIds = partnerAccounts.map((a) => a.id);

    const thisMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);

    const mySpendingTxs = await prisma.transaction.findMany({
      where: {
        accountId: { in: myAccountIds },
        isCredit: false,
        transferPairId: null,
        date: isAnchored ? { gte: thisMonthStart, lte: now } : { gte: thisMonthStart },
      },
      select: { amount: true },
    });
    const partnerSpendingTxs = await prisma.transaction.findMany({
      where: {
        accountId: { in: partnerAccountIds },
        isCredit: false,
        transferPairId: null,
        date: isAnchored ? { gte: thisMonthStart, lte: now } : { gte: thisMonthStart },
      },
      select: { amount: true },
    });

    spendingByMember[userId] = {
      name: currentUser?.name ?? "You",
      amount: mySpendingTxs.reduce((s, t) => s + t.amount, 0),
    };
    spendingByMember[partnerUserId] = {
      name: partnerUser?.name ?? "Partner",
      amount: partnerSpendingTxs.reduce((s, t) => s + t.amount, 0),
    };
  }

  // Pending transaction summary
  const pendingTransactions = await prisma.transaction.findMany({
    where: {
      accountId: { in: accountIds },
      isPending: true,
    },
    select: { amount: true },
  });
  const pendingCount = pendingTransactions.length;
  const pendingTotal = pendingTransactions.reduce((s, t) => s + t.amount, 0);

  // Daily spending for the last 30 days (sparkline)
  const thirtyDaysAgo = new Date(now);
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 29);
  thirtyDaysAgo.setHours(0, 0, 0, 0);
  const dailySpending: { date: string; amount: number }[] = [];
  const dailyMap: Record<string, number> = {};
  for (const tx of transactions) {
    if (tx.date < thirtyDaysAgo) continue;
    const key = tx.date.toISOString().slice(0, 10);
    dailyMap[key] = (dailyMap[key] ?? 0) + tx.amount;
  }
  for (let i = 0; i < 30; i++) {
    const d = new Date(thirtyDaysAgo);
    d.setDate(d.getDate() + i);
    const key = d.toISOString().slice(0, 10);
    dailySpending.push({ date: key, amount: dailyMap[key] ?? 0 });
  }

  // Top merchants this month
  const merchantThisMonth: Record<string, { amount: number; count: number; categoryName: string | null; categoryColor: string | null }> = {};
  const thisMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  for (const tx of transactions) {
    if (tx.date < thisMonthStart) continue;
    const name = tx.merchant ?? tx.description;
    if (!merchantThisMonth[name]) {
      merchantThisMonth[name] = {
        amount: 0,
        count: 0,
        categoryName: tx.category?.name ?? null,
        categoryColor: tx.category?.color ?? null,
      };
    }
    merchantThisMonth[name].amount += tx.amount;
    merchantThisMonth[name].count += 1;
  }
  const topMerchants = Object.entries(merchantThisMonth)
    .map(([merchant, d]) => ({ merchant, ...d }))
    .sort((a, b) => b.amount - a.amount)
    .slice(0, 6);

  // Recent transactions (last 8 across all accounts)
  const recentTransactions = await prisma.transaction.findMany({
    where: { accountId: { in: accountIds } },
    include: {
      category: { select: { name: true, color: true, icon: true } },
      account: { select: { name: true } },
    },
    orderBy: { date: "desc" },
    take: 8,
  });
  const recent = recentTransactions.map((tx) => ({
    id: tx.id,
    date: tx.date.toISOString().slice(0, 10),
    description: tx.merchant ?? tx.description,
    amount: tx.amount,
    isCredit: tx.isCredit,
    accountName: tx.account.name,
    category: tx.category,
  }));

  return NextResponse.json({
    monthlyByCategory,
    monthlyTotals,
    thisMonthTotal,
    lastMonthTotal,
    momChange,
    previousMonthSpending: lastMonthTotal,
    categorySpendingPrevMonth,
    topCategories,
    recurring,
    anomalies,
    budgetUtilization,
    incomeVsSpending,
    spendingByMember,
    totalTransactions: transactions.length,
    subscriptions,
    pendingCount,
    pendingTotal,
    dailySpending,
    topMerchants,
    recent,
  });
}
