import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const accounts = await prisma.account.findMany({
    where: { userId: session.user.id },
    include: {
      _count: { select: { transactions: true } },
    },
    orderBy: { createdAt: "asc" },
  });

  // Compute balance from transactions for each account
  const accountsWithBalance = await Promise.all(
    accounts.map(async (account: typeof accounts[0]) => {
      const agg = await prisma.transaction.aggregate({
        where: { accountId: account.id },
        _sum: { amount: true },
      });
      const balance = agg._sum.amount ?? 0;
      return { ...account, computedBalance: balance };
    })
  );

  return NextResponse.json(accountsWithBalance);
}

export async function POST(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { name, type, institution, lastFour } = await request.json();

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
    },
  });

  return NextResponse.json(account);
}
