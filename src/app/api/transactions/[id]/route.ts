import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getHouseholdAccountIds } from "@/lib/household";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const data = await request.json();

  const householdAccountIds = await getHouseholdAccountIds(session.user.id);
  const tx = await prisma.transaction.findUnique({ where: { id } });
  if (!tx || !householdAccountIds.includes(tx.accountId)) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // If merchant is being renamed, save the alias so future uploads auto-apply it
  if (data.merchant !== undefined && data.merchant !== tx.merchant && tx.merchant) {
    await prisma.merchantAlias.upsert({
      where: { userId_fromName: { userId: session.user.id, fromName: tx.merchant } },
      update: { toName: data.merchant },
      create: { userId: session.user.id, fromName: tx.merchant, toName: data.merchant },
    });
  }

  const updated = await prisma.transaction.update({
    where: { id },
    data: {
      categoryId: data.categoryId !== undefined ? (data.categoryId || null) : undefined,
      notes: data.notes !== undefined ? data.notes : undefined,
      description: data.description !== undefined ? data.description : undefined,
      merchant: data.merchant !== undefined ? data.merchant : undefined,
      amount: data.amount !== undefined ? parseFloat(data.amount) : undefined,
      date: data.date !== undefined ? new Date(data.date) : undefined,
    },
    include: { category: true, account: { select: { id: true, name: true, type: true } } },
  });

  // If amount was changed on a linked transfer, mirror the new amount to the
  // paired side so the two don't diverge.
  if (data.amount !== undefined && tx.transferPairId) {
    await prisma.transaction.update({
      where: { id: tx.transferPairId },
      data: { amount: parseFloat(data.amount) },
    });
  }

  return NextResponse.json(updated);
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;

  const householdAccountIds = await getHouseholdAccountIds(session.user.id);
  const tx = await prisma.transaction.findUnique({ where: { id } });
  if (!tx || !householdAccountIds.includes(tx.accountId)) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // If this tx is part of a transfer pair, clear the pair's pointer first
  // so we don't leave a dangling reference.
  if (tx.transferPairId) {
    await prisma.transaction.update({
      where: { id: tx.transferPairId },
      data: { transferPairId: null },
    });
  }

  await prisma.transaction.delete({ where: { id } });

  return NextResponse.json({ success: true });
}
