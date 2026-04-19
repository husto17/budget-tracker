import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getHouseholdAccountIds } from "@/lib/household";

export async function GET(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const page = Math.max(parseInt(searchParams.get("page") ?? "1") || 1, 1);
  const limit = Math.min(parseInt(searchParams.get("limit") ?? "50") || 50, 200);

  const accountIds = await getHouseholdAccountIds(session.user.id);

  const [transactions, total] = await Promise.all([
    prisma.transaction.findMany({
      where: { accountId: { in: accountIds }, deletedAt: { not: null } },
      include: {
        category: { select: { id: true, name: true, color: true } },
        account: { select: { id: true, name: true, type: true } },
      },
      orderBy: { deletedAt: "desc" },
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.transaction.count({
      where: { accountId: { in: accountIds }, deletedAt: { not: null } },
    }),
  ]);

  return NextResponse.json({ transactions, total, page, limit });
}

// Purge ALL soft-deleted transactions for this household (irreversible)
export async function DELETE() {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const accountIds = await getHouseholdAccountIds(session.user.id);

  const result = await prisma.transaction.deleteMany({
    where: { accountId: { in: accountIds }, deletedAt: { not: null } },
  });

  return NextResponse.json({ purged: result.count });
}
