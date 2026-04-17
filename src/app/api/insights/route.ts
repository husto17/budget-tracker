import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getHouseholdAccountIds, getPartnerUserId } from "@/lib/household";

export async function GET(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const monthsBack = parseInt(searchParams.get("months") ?? "6");

  const userId = session.user.id;
  const now = new Date();
  const startDate = new Date(now.getFullYear(), now.getMonth() - monthsBack, 1);

  // Get all household account IDs (own + partner's)
  const accountIds = await getHouseholdAccountIds(userId);

  // Get all spending transactions in range (debits only, exclude transfers)
  const transactions = await prisma.transaction.findMany({
    where: {
      accountId: { in: accountIds },
      isCredit: false,
      date: { gte: startDate },
      transferPairId: null, // exclude transfers
    },
    include: { category: true },
    orderBy: { date: "asc" },
  });

  // Monthly spending by category
  const monthlyByCategory: Record<string, Record<string, number>> = {};
  for (const tx of transactions) {
    const monthKey = `${tx.date.getFullYear()}-${String(tx.date.getMonth() + 1).padStart(2, "0")}`;
    const catName = tx.category?.name ?? "Uncategorized";
    if (!monthlyByCategory[monthKey]) monthlyByCategory[monthKey] = {};
    monthlyByCategory[monthKey][catName] = (monthlyByCategory[monthKey][catName] ?? 0) + tx.amount;
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
      date: { gte: startDate },
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
        date: { gte: thisMonthStart },
      },
      select: { amount: true },
    });
    const partnerSpendingTxs = await prisma.transaction.findMany({
      where: {
        accountId: { in: partnerAccountIds },
        isCredit: false,
        transferPairId: null,
        date: { gte: thisMonthStart },
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
  });
}
