import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getHouseholdAccountIds } from "@/lib/household";

// GET — fetch transactions for an account in a date range for the wizard
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const { searchParams } = new URL(request.url);
  const from = searchParams.get("from");
  const to = searchParams.get("to");

  const accountIds = await getHouseholdAccountIds(session.user.id);
  if (!accountIds.includes(id)) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const dateFilter: Record<string, Date> = {};
  if (from) dateFilter.gte = new Date(from + "T00:00:00.000Z");
  if (to) dateFilter.lte = new Date(new Date(to + "T00:00:00.000Z").getTime() + 86_400_000 - 1);

  const transactions = await prisma.transaction.findMany({
    where: {
      accountId: id,
      deletedAt: null,
      ...(Object.keys(dateFilter).length > 0 ? { date: dateFilter } : {}),
    },
    include: { category: { select: { name: true, color: true } } },
    orderBy: { date: "asc" },
  });

  return NextResponse.json(transactions);
}

// POST — mark a set of transaction IDs as reconciled
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const { transactionIds } = await request.json() as { transactionIds: string[] };

  if (!Array.isArray(transactionIds) || transactionIds.length === 0) {
    return NextResponse.json({ error: "transactionIds required" }, { status: 400 });
  }

  const accountIds = await getHouseholdAccountIds(session.user.id);
  if (!accountIds.includes(id)) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const result = await prisma.transaction.updateMany({
    where: { id: { in: transactionIds }, accountId: id, deletedAt: null },
    data: { isReconciled: true },
  });

  return NextResponse.json({ reconciled: result.count });
}
