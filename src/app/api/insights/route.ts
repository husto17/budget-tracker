import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getHouseholdAccountIds, getHouseholdId, getPartnerUserId } from "@/lib/household";

export async function GET(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const monthsBack = Math.min(Math.max(parseInt(searchParams.get("months") ?? "6") || 6, 1), 24);
  const accountIdFilter = searchParams.get("accountId");
  const fromParam = searchParams.get("from"); // YYYY-MM-DD custom range
  const toParam = searchParams.get("to");     // YYYY-MM-DD custom range

  // Optional ?month=YYYY-MM — rebase "this month / last month / upcoming bills /
  // top merchants / dailySpending" semantics onto a specific historical month
  // for the dashboard period selector and the /compare page.
  const monthParam = searchParams.get("month");
  const monthMatch = monthParam ? /^(\d{4})-(\d{2})$/.exec(monthParam) : null;
  const anchorYear = monthMatch ? parseInt(monthMatch[1]) : null;
  const anchorMonth = monthMatch ? parseInt(monthMatch[2]) - 1 : null;

  const userId = session.user.id;
  const realNow = new Date();
  const now =
    anchorYear !== null && anchorMonth !== null
      ? new Date(anchorYear, anchorMonth + 1, 0, 23, 59, 59)
      : realNow;
  const isAnchored = now.getTime() !== realNow.getTime();
  const startDate = new Date(now.getFullYear(), now.getMonth() - monthsBack, 1);

  // Custom date range overrides monthsBack
  const effectiveStart = fromParam ? new Date(fromParam + "T00:00:00") : startDate;
  const effectiveEnd: Date | null = toParam
    ? new Date(toParam + "T23:59:59")
    : isAnchored ? now : null;

  // Get all household account IDs (own + partner's)
  const [accountIds, householdId] = await Promise.all([
    getHouseholdAccountIds(userId),
    getHouseholdId(userId),
  ]);
  const categoryOwnerWhere = householdId ? { householdId } : { userId };
  const effectiveAccountIds =
    accountIdFilter && accountIds.includes(accountIdFilter)
      ? [accountIdFilter]
      : accountIds;

  // Get all spending transactions in range (debits only, exclude transfers).
  // Pending screenshot transactions ARE included — this is intentional so
  // mid-month spending tracking works. Double-counting is prevented because
  // when a statement is uploaded, the pending record is UPDATED in-place to
  // become the statement transaction (never two records for the same expense).
  const transactionsRaw = await prisma.transaction.findMany({
    where: {
      accountId: { in: effectiveAccountIds },
      isCredit: false,
      isExcluded: false,
      deletedAt: null,
      date: effectiveEnd ? { gte: effectiveStart, lte: effectiveEnd } : { gte: effectiveStart },
      transferPairId: null,
    },
    include: {
      category: true,
      splits: { include: { category: true } },
      reimbursementsReceived: { select: { amount: true } },
    },
    orderBy: { date: "asc" },
  });

  // Apply reimbursements: debit.amount -= sum of linked reimbursements.
  // A fully-reimbursed debit (amount === 0) drops out entirely so it doesn't
  // pollute category totals or top-merchant rankings.
  const transactions = transactionsRaw
    .map((tx) => {
      const offset = tx.reimbursementsReceived.reduce((s, r) => s + r.amount, 0);
      const netAmount = Math.max(tx.amount - offset, 0);
      return { ...tx, amount: netAmount, grossAmount: tx.amount };
    })
    .filter((tx) => tx.amount > 0.005);

  // Day-of-week spending distribution
  const DOW_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const dowMap: Record<number, { amount: number; count: number }> = {};
  for (let i = 0; i < 7; i++) dowMap[i] = { amount: 0, count: 0 };
  for (const tx of transactions) {
    const d = tx.date.getDay();
    dowMap[d].amount += tx.amount;
    dowMap[d].count += 1;
  }
  const dayOfWeekSpending = DOW_NAMES.map((dayName, i) => ({
    dayName,
    amount: Math.round(dowMap[i].amount * 100) / 100,
    count: dowMap[i].count,
    avg: dowMap[i].count > 0 ? Math.round((dowMap[i].amount / dowMap[i].count) * 100) / 100 : 0,
  }));

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

  // Legacy simple recurring (kept for backwards compat, not shown in new UI)
  const recurring: Array<{ name: string; amount: number; months: number }> = [];

  // Subscription / recurring detection with cadence analysis
  type Cadence = "weekly" | "biweekly" | "monthly" | "quarterly" | "annual";
  interface MerchantEntry {
    amounts: number[];
    dates: Date[];
    categoryId: string | null;
    categoryName: string | null;
    manualType: string | null; // most recent manual override for this merchant
  }
  const merchantData: Record<string, MerchantEntry> = {};
  for (const tx of transactionsRaw) { // use raw so we can read recurringType before reimbursement netting
    const name = tx.merchant ?? tx.description;
    if (!merchantData[name]) {
      merchantData[name] = { amounts: [], dates: [], categoryId: tx.categoryId, categoryName: tx.category?.name ?? null, manualType: null };
    }
    merchantData[name].amounts.push(tx.amount);
    merchantData[name].dates.push(tx.date);
    // Keep category + manual type from the most recent tx
    if (tx.date >= (merchantData[name].dates[merchantData[name].dates.length - 1] ?? tx.date)) {
      merchantData[name].categoryId = tx.categoryId;
      merchantData[name].categoryName = tx.category?.name ?? null;
      if (tx.recurringType) merchantData[name].manualType = tx.recurringType;
    }
  }

  function detectCadence(dates: Date[]): { cadence: Cadence | null; intervalDays: number } {
    if (dates.length < 2) return { cadence: null, intervalDays: 0 };
    const sorted = [...dates].sort((a, b) => a.getTime() - b.getTime());
    const intervals: number[] = [];
    for (let i = 1; i < sorted.length; i++) {
      intervals.push((sorted[i].getTime() - sorted[i - 1].getTime()) / 86_400_000);
    }
    intervals.sort((a, b) => a - b);
    const median = intervals[Math.floor(intervals.length / 2)];
    // Visited more than every 5 days → habit/daily spend, not a subscription
    if (median < 5) return { cadence: null, intervalDays: median };
    if (median <= 10) return { cadence: "weekly", intervalDays: 7 };
    if (median <= 20) return { cadence: "biweekly", intervalDays: 14 };
    if (median <= 50) return { cadence: "monthly", intervalDays: 30 };
    if (median <= 120) return { cadence: "quarterly", intervalDays: 91 };
    if (median <= 400) return { cadence: "annual", intervalDays: 365 };
    return { cadence: null, intervalDays: median };
  }

  const MONTHLY_FACTOR: Record<Cadence, number> = {
    weekly: 4.33,
    biweekly: 2.17,
    monthly: 1,
    quarterly: 1 / 3,
    annual: 1 / 12,
  };

  const todayMs = now.getTime();

  // Categories that indicate shopping/dining — not subscriptions or bills
  const SHOPPING_CATEGORY_KEYWORDS = [
    "grocer", "supermarket", "restaurant", "dining", "food", "coffee",
    "shopping", "retail", "amazon", "department", "clothing", "pharmacy",
    "drug store", "gas", "fuel", "parking", "transport", "uber", "lyft",
  ];
  function isShoppingCategory(categoryName: string | null): boolean {
    if (!categoryName) return false;
    const lower = categoryName.toLowerCase();
    return SHOPPING_CATEGORY_KEYWORDS.some((kw) => lower.includes(kw));
  }

  const subscriptions = Object.entries(merchantData)
    .filter(([, data]) => {
      // Manual "none" = user explicitly said this is not a subscription/bill
      if (data.manualType === "none") return false;
      // Manual subscription/bill tag always shows regardless of auto-detection
      if (data.manualType === "subscription" || data.manualType === "bill") return true;
      // Auto-detection: need at least 3 occurrences
      if (data.dates.length < 3) return false;
      // Exclude shopping/dining categories — variable purchases, not bills
      if (isShoppingCategory(data.categoryName)) return false;
      const avgAmount = data.amounts.reduce((a, b) => a + b, 0) / data.amounts.length;
      // Allow up to 1 outlier: at least 80% of amounts must be within 25% of avg
      const consistent = data.amounts.filter((a) => Math.abs(a - avgAmount) / Math.max(avgAmount, 1) <= 0.25);
      if (consistent.length / data.amounts.length < 0.80) return false;
      const { cadence } = detectCadence(data.dates);
      return cadence !== null;
    })
    .map(([merchant, data]) => {
      const avgAmount = data.amounts.reduce((a, b) => a + b, 0) / data.amounts.length;
      const sorted = [...data.dates].sort((a, b) => a.getTime() - b.getTime());
      const lastDate = sorted[sorted.length - 1];
      const { cadence, intervalDays } = detectCadence(data.dates);
      const nextExpectedDate = new Date(lastDate.getTime() + intervalDays * 86_400_000);
      const daysUntilNext = Math.round((nextExpectedDate.getTime() - todayMs) / 86_400_000);
      const monthlyEquivalent = cadence ? avgAmount * MONTHLY_FACTOR[cadence] : avgAmount;
      // Manual tag wins; otherwise compute from variance
      const consistent = data.amounts.filter((a) => Math.abs(a - avgAmount) / Math.max(avgAmount, 1) <= 0.25);
      const variance = consistent.length > 0
        ? consistent.reduce((s, a) => s + Math.abs(a - avgAmount), 0) / consistent.length / Math.max(avgAmount, 1)
        : 1;
      const type: "subscription" | "bill" = data.manualType === "subscription" ? "subscription"
        : data.manualType === "bill" ? "bill"
        : variance <= 0.05 ? "subscription" : "bill";
      return {
        merchant,
        amount: Math.round(avgAmount * 100) / 100,
        cadence,
        type,
        monthlyEquivalent: Math.round(monthlyEquivalent * 100) / 100,
        categoryId: data.categoryId,
        categoryName: data.categoryName,
        lastDate: lastDate.toISOString().slice(0, 10),
        nextExpectedDate: nextExpectedDate.toISOString().slice(0, 10),
        daysUntilNext,
        monthlyCount: data.dates.length,
      };
    })
    .sort((a, b) => b.monthlyEquivalent - a.monthlyEquivalent);

  // Anomalies: categories where this month > 150% of average
  const anomalies: Array<{ category: string; thisMonth: number; average: number; ratio: number }> = [];
  const allMonths = Object.keys(monthlyByCategory).filter((m) => m !== thisMonth);
  if (allMonths.length >= 2) {
    const allCats = new Set(Object.values(monthlyByCategory).flatMap((m) => Object.keys(m)));
    for (const cat of allCats) {
      // Only average months where the category had actual spending (avoids
      // zero-fill deflating the average for infrequent categories)
      const historical = allMonths
        .map((m) => monthlyByCategory[m][cat] ?? 0)
        .filter((v) => v > 0);
      if (historical.length < 2) continue; // need at least 2 months of history
      const avg = historical.reduce((a, b) => a + b, 0) / historical.length;
      const current = thisMonthCats[cat] ?? 0;
      if (avg > 10 && current > avg * 1.5) {
        anomalies.push({ category: cat, thisMonth: current, average: avg, ratio: current / avg });
      }
    }
  }

  // All category colors (for chart coloring in the frontend)
  const allCategoryRows = await prisma.category.findMany({
    where: categoryOwnerWhere,
    select: { name: true, color: true },
  });
  const categoryColors: Record<string, string> = Object.fromEntries(
    allCategoryRows.map((c) => [c.name, c.color])
  );

  // Previous month category spending (needed for budget rollover calc below)
  const categorySpendingPrevMonth: Record<string, number> = monthlyByCategory[lastMonth] ?? {};

  // Budget utilization (categories with budgets set)
  const categories = await prisma.category.findMany({
    where: { ...categoryOwnerWhere, monthlyBudget: { not: null } },
  });

  // Historical budget vs actual per category (last 12 months)
  const budgetHistoryMonths = Object.keys(monthlyByCategory).sort().slice(-12);
  const categoryBudgetHistory = categories
    .map((cat: typeof categories[0]) => ({
      category: cat.name,
      color: cat.color,
      budget: cat.monthlyBudget!,
      history: budgetHistoryMonths.map((month) => ({
        month,
        spent: monthlyByCategory[month]?.[cat.name] ?? 0,
        budget: cat.monthlyBudget!,
      })),
    }))
    .filter((c) => c.history.some((h) => h.spent > 0));

  const budgetUtilization = categories.map((cat: typeof categories[0]) => {
    const spent = thisMonthCats[cat.name] ?? 0;
    const base = cat.monthlyBudget!;
    const rolloverAmount = cat.budgetRollover
      ? Math.max(0, base - (categorySpendingPrevMonth[cat.name] ?? 0))
      : 0;
    const budget = base + rolloverAmount;
    return {
      category: cat.name,
      color: cat.color,
      spent,
      budget,
      baseBudget: base,
      rolloverAmount,
      remaining: budget - spent,
      pct: Math.min((spent / budget) * 100, 100),
    };
  });

  // Income vs spending by month
  // Income = credits minus anything that's been tagged as reimbursement for
  // a prior debit. A credit that's 100% reimbursement is 0 income.
  // Exclude credit card accounts — credits there are repayments, not income.
  const incomeRaw = await prisma.transaction.findMany({
    where: {
      accountId: { in: effectiveAccountIds },
      account: { type: { not: "CREDIT_CARD" } },
      isCredit: true,
      deletedAt: null,
      date: effectiveEnd ? { gte: effectiveStart, lte: effectiveEnd } : { gte: effectiveStart },
      transferPairId: null,
    },
    include: { reimbursementsApplied: { select: { amount: true } } },
    orderBy: { date: "asc" },
  });
  const monthlyIncome: Record<string, number> = {};
  const incomeTransactions = incomeRaw.map((tx) => {
    const applied = tx.reimbursementsApplied.reduce((s, r) => s + r.amount, 0);
    return { ...tx, amount: Math.max(tx.amount - applied, 0) };
  });
  for (const tx of incomeTransactions) {
    if (tx.amount <= 0.005) continue; // fully reimbursed — not real income
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


  // ── Merchant loyalty map ─────────────────────────────────────────────────
  const merchantLoyalty = Object.entries(merchantData)
    .filter(([, d]) => d.dates.length >= 3)
    .map(([merchant, d]) => {
      const sorted = [...d.dates].sort((a, b) => a.getTime() - b.getTime());
      const intervals: number[] = [];
      for (let i = 1; i < sorted.length; i++)
        intervals.push((sorted[i].getTime() - sorted[i - 1].getTime()) / 86_400_000);
      const avg = intervals.reduce((a, b) => a + b, 0) / intervals.length;
      const mid = Math.floor(intervals.length / 2);
      const early = intervals.slice(0, mid);
      const late = intervals.slice(mid);
      const avgEarly = early.length ? early.reduce((a, b) => a + b, 0) / early.length : avg;
      const avgLate = late.length ? late.reduce((a, b) => a + b, 0) / late.length : avg;
      // Require both a 25% relative change AND at least a 3-day absolute shift
      // so frequent merchants (visited every 2d) don't flip on minor noise.
      const diff = avgLate - avgEarly;
      const trend: "increasing" | "decreasing" | "stable" =
        diff < 0 && avgLate < avgEarly * 0.75 && Math.abs(diff) >= 3 ? "increasing"
        : diff > 0 && avgLate > avgEarly * 1.25 && diff >= 3 ? "decreasing"
        : "stable";
      return {
        merchant,
        visitCount: d.dates.length,
        avgDaysBetween: Math.round(avg),
        trend,
        lastVisit: sorted[sorted.length - 1].toISOString().slice(0, 10),
        totalSpent: Math.round(d.amounts.reduce((a, b) => a + b, 0) * 100) / 100,
      };
    })
    .sort((a, b) => a.avgDaysBetween - b.avgDaysBetween)
    .slice(0, 12);

  // ── Payday pattern ───────────────────────────────────────────────────────
  // Group income by day-of-month, tracking which months it appeared in
  const dayOfMonthIncome: Record<number, { total: number; months: Set<string>; amounts: number[] }> = {};
  for (const tx of incomeTransactions) {
    if (tx.amount <= 0.005) continue;
    const day = tx.date.getDate();
    const monthKey = `${tx.date.getFullYear()}-${tx.date.getMonth()}`;
    if (!dayOfMonthIncome[day]) dayOfMonthIncome[day] = { total: 0, months: new Set(), amounts: [] };
    dayOfMonthIncome[day].total += tx.amount;
    dayOfMonthIncome[day].months.add(monthKey);
    dayOfMonthIncome[day].amounts.push(tx.amount);
  }
  const totalIncomeAmount = Object.values(dayOfMonthIncome).reduce((a, b) => a + b.total, 0);
  const detectedPaydays = Object.entries(dayOfMonthIncome)
    .filter(([, d]) => {
      if (totalIncomeAmount <= 0) return false;
      // Must appear in at least 2 distinct months (rules out one-off transfers)
      if (d.months.size < 2) return false;
      // Each occurrence must average at least $100 (rules out small Venmo/Zelle)
      const avgPerOccurrence = d.total / d.amounts.length;
      if (avgPerOccurrence < 100) return false;
      // Must be at least 10% of total income across the window
      return d.total > totalIncomeAmount * 0.10;
    })
    .sort(([, a], [, b]) => b.total - a.total)
    .slice(0, 3)
    .map(([d]) => parseInt(d))
    .sort((a, b) => a - b);
  const spendingByDayMap: Record<number, { amount: number; count: number }> = {};
  for (let i = 1; i <= 31; i++) spendingByDayMap[i] = { amount: 0, count: 0 };
  for (const tx of transactions) {
    const d = tx.date.getDate();
    spendingByDayMap[d].amount += tx.amount;
    spendingByDayMap[d].count += 1;
  }
  const spendingByDayOfMonth = Array.from({ length: 31 }, (_, i) => ({
    day: i + 1,
    amount: Math.round((spendingByDayMap[i + 1].amount) * 100) / 100,
    count: spendingByDayMap[i + 1].count,
  }));
  const paydayPattern = detectedPaydays.length > 0
    ? { detectedPaydays, spendingByDayOfMonth }
    : null;

  // ── Transaction size distribution ────────────────────────────────────────
  const SIZE_BUCKETS = [
    { label: "$0–25", min: 0, max: 25 },
    { label: "$25–50", min: 25, max: 50 },
    { label: "$50–100", min: 50, max: 100 },
    { label: "$100–250", min: 100, max: 250 },
    { label: "$250–500", min: 250, max: 500 },
    { label: "$500+", min: 500, max: Infinity },
  ];
  const txSizeDistribution = SIZE_BUCKETS.map(({ label, min, max }) => {
    const matches = transactions.filter((tx) => tx.amount >= min && tx.amount < max);
    return {
      label,
      count: matches.length,
      amount: Math.round(matches.reduce((s, tx) => s + tx.amount, 0) * 100) / 100,
    };
  });

  // ── Surprise expenses (large one-offs not in recurring list) ─────────────
  const recurringMerchantSet = new Set(subscriptions.map((s) => s.merchant));
  const catAvgMap: Record<string, number> = {};
  const catMonthCounts: Record<string, number> = {};
  for (const [, cats] of Object.entries(monthlyByCategory)) {
    for (const [cat, amt] of Object.entries(cats)) {
      catAvgMap[cat] = (catAvgMap[cat] ?? 0) + amt;
      catMonthCounts[cat] = (catMonthCounts[cat] ?? 0) + 1;
    }
  }
  for (const cat of Object.keys(catAvgMap))
    catAvgMap[cat] = catAvgMap[cat] / (catMonthCounts[cat] || 1);
  const ninetyDaysAgo = new Date(now);
  ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);
  const surpriseExpenses = transactions
    .filter((tx) => {
      if (tx.date < ninetyDaysAgo) return false;
      const merchant = tx.merchant ?? tx.description;
      if (recurringMerchantSet.has(merchant)) return false;
      const cat = tx.category?.name ?? "Uncategorized";
      const avg = catAvgMap[cat] ?? 0;
      return avg > 10 && tx.amount > avg * 2;
    })
    .map((tx) => ({
      merchant: tx.merchant ?? tx.description,
      amount: tx.amount,
      date: tx.date.toISOString().slice(0, 10),
      categoryName: tx.category?.name ?? null,
      categoryAvg: Math.round((catAvgMap[tx.category?.name ?? "Uncategorized"] ?? 0) * 100) / 100,
    }))
    .sort((a, b) => b.amount - a.amount)
    .slice(0, 8);

  // ── Categorization hygiene score ─────────────────────────────────────────
  const totalTxCount = transactions.length;
  const categorizedCount = transactions.filter((tx) => tx.categoryId !== null).length;
  const totalAmount = transactions.reduce((s, tx) => s + tx.amount, 0);
  const categorizedAmount = transactions
    .filter((tx) => tx.categoryId !== null)
    .reduce((s, tx) => s + tx.amount, 0);
  const catAmtPct = totalAmount > 0 ? (categorizedAmount / totalAmount) * 100 : 100;
  const catCountPct = totalTxCount > 0 ? (categorizedCount / totalTxCount) * 100 : 100;
  const hygiene = {
    totalTxCount,
    categorizedCount,
    categorizedPct: Math.round(catCountPct),
    totalAmount: Math.round(totalAmount * 100) / 100,
    categorizedAmount: Math.round(categorizedAmount * 100) / 100,
    categorizedAmountPct: Math.round(catAmtPct),
    score: Math.round(catCountPct * 0.4 + catAmtPct * 0.6),
  };

  // ── Bill timing risk ─────────────────────────────────────────────────────
  const billTimingRisk = subscriptions
    .filter((s) => s.daysUntilNext >= 0 && s.daysUntilNext <= 21)
    .flatMap((s) => {
      const d = new Date(s.nextExpectedDate).getDate();
      const reason =
        d >= 26 ? "charges near month-end — balance may be low" :
        d <= 5 ? "charges in first 5 days — before payday clears" :
        detectedPaydays.some((p) => Math.abs(p - d) <= 2) ? "charges right around payday" :
        null;
      return reason ? [{ merchant: s.merchant, amount: s.amount, nextExpectedDate: s.nextExpectedDate, daysUntilNext: s.daysUntilNext, riskReason: reason }] : [];
    });

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
        deletedAt: null,
        transferPairId: null,
        date: isAnchored ? { gte: thisMonthStart, lte: now } : { gte: thisMonthStart },
      },
      select: { amount: true, reimbursementsReceived: { select: { amount: true } } },
    });
    const partnerSpendingTxs = await prisma.transaction.findMany({
      where: {
        accountId: { in: partnerAccountIds },
        isCredit: false,
        deletedAt: null,
        transferPairId: null,
        date: isAnchored ? { gte: thisMonthStart, lte: now } : { gte: thisMonthStart },
      },
      select: { amount: true, reimbursementsReceived: { select: { amount: true } } },
    });
    const netMember = (t: { amount: number; reimbursementsReceived: { amount: number }[] }) =>
      Math.max(t.amount - t.reimbursementsReceived.reduce((s, r) => s + r.amount, 0), 0);

    spendingByMember[userId] = {
      name: currentUser?.name ?? "You",
      amount: mySpendingTxs.reduce((s, t) => s + netMember(t), 0),
    };
    spendingByMember[partnerUserId] = {
      name: partnerUser?.name ?? "Partner",
      amount: partnerSpendingTxs.reduce((s, t) => s + netMember(t), 0),
    };
  }

  // Pending transaction summary
  const pendingTransactions = await prisma.transaction.findMany({
    where: {
      accountId: { in: accountIds },
      isPending: true,
      deletedAt: null,
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
    where: { accountId: { in: accountIds }, deletedAt: null },
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
    categoryColors,
    dayOfWeekSpending,
    categoryBudgetHistory,
    merchantLoyalty,
    paydayPattern,
    txSizeDistribution,
    surpriseExpenses,
    hygiene,
    billTimingRisk,
    thisMonthTotal,
    lastMonthTotal,
    momChange,
    previousMonthSpending: lastMonthTotal,
    categorySpendingPrevMonth,
    topCategories,
    thisMonthCategorySpend: thisMonthCats,
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
