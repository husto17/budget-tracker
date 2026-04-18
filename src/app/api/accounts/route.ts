import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getPartnerUserId } from "@/lib/household";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const userId = session.user.id;
  const partnerUserId = await getPartnerUserId(userId);
  const userIds = partnerUserId ? [userId, partnerUserId] : [userId];

  const accounts = await prisma.account.findMany({
    where: { userId: { in: userIds } },
    include: {
      _count: { select: { transactions: true } },
    },
    orderBy: { createdAt: "asc" },
  });

  // Compute balance as credits − debits in a single groupBy call so we respect
  // direction. Previously we summed amount regardless of isCredit, which made
  // purchases and deposits cancel out on every account.
  //
  // Convention:
  //   - Checking/savings: positive balance = money you have
  //   - Credit cards: negative balance = money you owe (dashboard inverts for display)
  const grouped = await prisma.transaction.groupBy({
    by: ["accountId", "isCredit"],
    where: { accountId: { in: accounts.map((a) => a.id) } },
    _sum: { amount: true },
  });
  const balanceByAccount = new Map<string, number>();
  for (const row of grouped) {
    const prev = balanceByAccount.get(row.accountId) ?? 0;
    const delta = row.isCredit ? (row._sum.amount ?? 0) : -(row._sum.amount ?? 0);
    balanceByAccount.set(row.accountId, prev + delta);
  }
  const accountsWithBalance = accounts.map((account: typeof accounts[0]) => {
    const balance = balanceByAccount.get(account.id) ?? 0;
    const owner: "me" | "partner" = account.userId === userId ? "me" : "partner";
    return { ...account, computedBalance: balance, owner };
  });

  return NextResponse.json(accountsWithBalance);
}

export async function POST(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { name, type, institution, lastFour, isJoint } = await request.json();

  if (!name || !type) {
    return NextResponse.json({ error: "Name and type are required" }, { status: 400 });
  }

  const account = await prisma.account.create({
    data: {
      userId: session.user.id,
      name,
      type,
      institution,
      lastFour,
      isJoint: isJoint ?? false,
    },
  });

  return NextResponse.json(account);
}
