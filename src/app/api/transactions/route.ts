import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getHouseholdAccountIds } from "@/lib/household";
import { parseSearch } from "@/lib/search-parser";
import { CATEGORY_RENAMES } from "@/lib/default-categories";

export async function GET(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const page = Math.max(parseInt(searchParams.get("page") ?? "1") || 1, 1);
  const limit = Math.min(Math.max(parseInt(searchParams.get("limit") ?? "50") || 50, 1), 500);
  const accountId = searchParams.get("accountId");
  const categoryId = searchParams.get("categoryId");
  const tagId = searchParams.get("tagId");
  const search = searchParams.get("search");
  const from = searchParams.get("from");
  const to = searchParams.get("to");
  const uncategorized = searchParams.get("uncategorized") === "true";
  const status = searchParams.get("status"); // "pending" | "posted" | "all"
  const sort = searchParams.get("sort") === "asc" ? "asc" : "desc";

  const householdAccountIds = await getHouseholdAccountIds(session.user.id);

  // Collect all user IDs in the household once — used for category resolution.
  const householdUserIds = [...new Set(
    (await prisma.account.findMany({
      where: { id: { in: householdAccountIds } },
      select: { userId: true },
    })).map((a) => a.userId)
  )];

  // Parse the search string for operators (amount:>100, category:dining, …).
  // The text remainder still goes through the normal fulltext description/
  // merchant match.
  const parsed = parseSearch(search ?? "");

  // When a categoryId is supplied via the dropdown, resolve it to ALL same-named
  // categories across the household. Without this, transactions on a partner's
  // account (categorized with the partner's category UUID) are invisible when
  // the logged-in user filters by their own UUID for the same category name.
  let resolvedCategoryIds: string[] | null = null;
  if (categoryId) {
    const cat = await prisma.category.findUnique({ where: { id: categoryId }, select: { name: true } });
    if (cat) {
      // Also include any historical names that rename to this category — handles
      // the case where a household partner's categories haven't been migrated yet
      // (e.g. partner still has "Transportation" while current user has "Transport").
      const historicalNames = CATEGORY_RENAMES
        .filter((r) => r.to.toLowerCase() === cat.name.toLowerCase())
        .map((r) => r.from);
      const allNames = [cat.name, ...historicalNames];
      const matching = await prisma.category.findMany({
        where: {
          userId: { in: householdUserIds },
          OR: allNames.map((n) => ({ name: { equals: n, mode: "insensitive" as const } })),
        },
        select: { id: true },
      });
      resolvedCategoryIds = matching.length > 0 ? matching.map((c) => c.id) : [categoryId];
    } else {
      resolvedCategoryIds = [categoryId];
    }
  }

  // Resolve category/account operators to concrete IDs via case-insensitive
  // contains match against the user's own data.
  let operatorCategoryIds: string[] | null = null;
  if (parsed.categoryLike) {
    const cats = await prisma.category.findMany({
      where: {
        userId: { in: householdUserIds },
        name: { contains: parsed.categoryLike, mode: "insensitive" },
      },
      select: { id: true },
    });
    operatorCategoryIds = cats.map((c) => c.id);
    if (operatorCategoryIds.length === 0) operatorCategoryIds = ["__no_match__"];
  }
  let operatorAccountIds: string[] | null = null;
  if (parsed.accountLike) {
    const accs = await prisma.account.findMany({
      where: {
        id: { in: householdAccountIds },
        name: { contains: parsed.accountLike, mode: "insensitive" },
      },
      select: { id: true },
    });
    operatorAccountIds = accs.map((a) => a.id);
    if (operatorAccountIds.length === 0) operatorAccountIds = ["__no_match__"];
  }

  // Combine URL filters (from/to/amount sources) with operator filters. URL
  // params take priority when both are set to avoid surprising the UI.
  const dateGte = from ? new Date(from + "T00:00:00.000Z") : parsed.from;
  // End of the requested day — parse as start of NEXT day so all transactions
  // on the "to" date are included regardless of their time component.
  const dateLte = to
    ? new Date(new Date(to + "T00:00:00.000Z").getTime() + 86_400_000 - 1)
    : parsed.to;

  // amount filter — one of exact, range, min-only, max-only.
  const amountFilter: { gte?: number; lte?: number; equals?: number } = {};
  if (parsed.amount != null) amountFilter.equals = parsed.amount;
  else {
    if (parsed.amountMin != null) amountFilter.gte = parsed.amountMin;
    if (parsed.amountMax != null) amountFilter.lte = parsed.amountMax;
  }

  const accountIdFilter = accountId
    ? accountId
    : operatorAccountIds
    ? { in: operatorAccountIds }
    : { in: householdAccountIds };

  const textSearch = parsed.text || (parsed.merchantLike ?? "");

  const where = {
    accountId: accountIdFilter,
    deletedAt: null,
    ...(resolvedCategoryIds
      ? { categoryId: { in: resolvedCategoryIds } }
      : operatorCategoryIds
      ? { categoryId: { in: operatorCategoryIds } }
      : {}),
    ...(uncategorized ? { categoryId: null } : {}),
    ...(textSearch
      ? {
          OR: [
            { description: { contains: textSearch, mode: "insensitive" as const } },
            { merchant: { contains: textSearch, mode: "insensitive" as const } },
          ],
        }
      : {}),
    ...(dateGte || dateLte
      ? {
          date: {
            ...(dateGte ? { gte: dateGte } : {}),
            ...(dateLte ? { lte: dateLte } : {}),
          },
        }
      : {}),
    ...(Object.keys(amountFilter).length > 0 ? { amount: amountFilter } : {}),
    ...(status === "pending" ? { isPending: true } : {}),
    ...(status === "posted" ? { isPending: false } : {}),
    ...(tagId ? { tags: { some: { tagId } } } : {}),
  };

  const [transactions, total] = await Promise.all([
    prisma.transaction.findMany({
      where,
      include: {
        category: true,
        account: { select: { id: true, name: true, type: true, isJoint: true } },
        transferPair: {
          include: { account: { select: { id: true, name: true } } },
        },
        splits: {
          include: { category: true },
          orderBy: { createdAt: "asc" },
        },
        reimbursementsReceived: {
          include: {
            reimbursementTx: {
              select: { id: true, date: true, merchant: true, description: true, amount: true },
            },
          },
        },
        reimbursementsApplied: {
          include: {
            originalTx: {
              select: { id: true, date: true, merchant: true, description: true, amount: true },
            },
          },
        },
        tags: { include: { tag: true } },
      },
      orderBy: { date: sort },
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.transaction.count({ where }),
  ]);

  return NextResponse.json({ transactions, total, page, limit });
}

export async function POST(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { accountId, date, description, amount, isCredit, categoryId, notes } =
    await request.json();

  if (!accountId || !date || !description || amount == null) {
    return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
  }

  const householdIds = await getHouseholdAccountIds(session.user.id);
  const account = await prisma.account.findUnique({ where: { id: accountId } });
  if (!account || !householdIds.includes(account.id)) {
    return NextResponse.json({ error: "Account not found" }, { status: 404 });
  }

  const crypto = await import("crypto");
  const hash = crypto
    .createHash("sha256")
    .update(`${new Date(date).toISOString().slice(0, 10)}|${description}|${amount}`)
    .digest("hex")
    .slice(0, 16);

  const parsedAmount = typeof amount === "number" ? amount : parseFloat(String(amount));
  if (!isFinite(parsedAmount) || parsedAmount < 0) {
    return NextResponse.json({ error: "Invalid amount" }, { status: 400 });
  }

  // Create then fetch with includes — a single create-with-include call
  // starts an implicit transaction that the Neon HTTP adapter rejects.
  const created = await prisma.transaction.create({
    data: {
      accountId,
      date: new Date(date),
      description,
      originalDescription: description,
      amount: parsedAmount,
      isCredit: isCredit ?? false,
      categoryId: categoryId || null,
      notes,
      hash,
    },
  });
  const transaction = await prisma.transaction.findUnique({
    where: { id: created.id },
    include: { category: true, account: { select: { id: true, name: true, type: true } } },
  });

  return NextResponse.json(transaction);
}
