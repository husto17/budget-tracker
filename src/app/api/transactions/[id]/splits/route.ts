import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;

  const tx = await prisma.transaction.findUnique({
    where: { id },
    include: { account: true },
  });
  if (!tx || tx.account.userId !== session.user.id) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const splits = await prisma.transactionSplit.findMany({
    where: { transactionId: id },
    include: { category: true },
    orderBy: { createdAt: "asc" },
  });

  return NextResponse.json({ splits });
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;

  const tx = await prisma.transaction.findUnique({
    where: { id },
    include: { account: true },
  });
  if (!tx || tx.account.userId !== session.user.id) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const body = await request.json();
  const splits: Array<{ categoryId: string | null; amount: number; note?: string }> =
    body.splits ?? [];

  if (splits.length === 0) {
    return NextResponse.json({ error: "At least one split required" }, { status: 400 });
  }

  const splitTotal = splits.reduce((sum, s) => sum + s.amount, 0);
  if (Math.abs(splitTotal - tx.amount) > 0.01) {
    return NextResponse.json(
      {
        error: `Split amounts (${splitTotal.toFixed(2)}) must equal transaction amount (${tx.amount.toFixed(2)})`,
      },
      { status: 400 }
    );
  }

  // Delete existing splits
  await prisma.transactionSplit.deleteMany({ where: { transactionId: id } });

  // Create new splits sequentially — Neon HTTP adapter rejects the implicit
  // transaction that create-with-include uses, so create then re-fetch.
  const createdIds: string[] = [];
  for (const split of splits) {
    const s = await prisma.transactionSplit.create({
      data: {
        transactionId: id,
        categoryId: split.categoryId || null,
        amount: split.amount,
        note: split.note || null,
      },
    });
    createdIds.push(s.id);
  }
  const created = await prisma.transactionSplit.findMany({
    where: { id: { in: createdIds } },
    include: { category: true },
    orderBy: { createdAt: "asc" },
  });

  return NextResponse.json({ splits: created });
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;

  const tx = await prisma.transaction.findUnique({
    where: { id },
    include: { account: true },
  });
  if (!tx || tx.account.userId !== session.user.id) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  await prisma.transactionSplit.deleteMany({ where: { transactionId: id } });

  return NextResponse.json({ success: true });
}
