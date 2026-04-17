import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getHouseholdAccountIds } from "@/lib/household";

export async function GET(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const page = parseInt(searchParams.get("page") ?? "1");
  const limit = parseInt(searchParams.get("limit") ?? "50");
  const accountId = searchParams.get("accountId");
  const categoryId = searchParams.get("categoryId");
  const search = searchParams.get("search");
  const from = searchParams.get("from");
  const to = searchParams.get("to");
  const uncategorized = searchParams.get("uncategorized") === "true";

  const householdAccountIds = await getHouseholdAccountIds(session.user.id);

  const where = {
    accountId: accountId ? accountId : { in: householdAccountIds },
    ...(categoryId ? { categoryId } : {}),
    ...(uncategorized ? { categoryId: null } : {}),
    ...(search
      ? { description: { contains: search, mode: "insensitive" as const } }
      : {}),
    ...(from || to
      ? {
          date: {
            ...(from ? { gte: new Date(from) } : {}),
            ...(to ? { lte: new Date(to) } : {}),
          },
        }
      : {}),
  };

  const [transactions, total] = await Promise.all([
    prisma.transaction.findMany({
      where,
      include: {
        category: true,
        account: { select: { id: true, name: true, type: true } },
        transferPair: {
          include: { account: { select: { id: true, name: true } } },
        },
        splits: {
          include: { category: true },
          orderBy: { createdAt: "asc" },
        },
      },
      orderBy: { date: "desc" },
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

  const transaction = await prisma.transaction.create({
    data: {
      accountId,
      date: new Date(date),
      description,
      originalDescription: description,
      amount: parseFloat(amount),
      isCredit: isCredit ?? false,
      categoryId: categoryId || null,
      notes,
      hash,
    },
    include: { category: true, account: { select: { id: true, name: true, type: true } } },
  });

  return NextResponse.json(transaction);
}
