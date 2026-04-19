import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getHouseholdAccountIds, getHouseholdId } from "@/lib/household";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const { pairedTransactionId } = await request.json();

  if (!pairedTransactionId) {
    return NextResponse.json({ error: "pairedTransactionId is required" }, { status: 400 });
  }

  const [householdAccountIds, householdId] = await Promise.all([
    getHouseholdAccountIds(session.user.id),
    getHouseholdId(session.user.id),
  ]);

  // Verify both transactions belong to household-visible accounts
  const txA = await prisma.transaction.findUnique({ where: { id } });
  const txB = await prisma.transaction.findUnique({ where: { id: pairedTransactionId } });

  if (!txA || !householdAccountIds.includes(txA.accountId)) {
    return NextResponse.json({ error: "Transaction not found" }, { status: 404 });
  }
  if (!txB || !householdAccountIds.includes(txB.accountId)) {
    return NextResponse.json({ error: "Paired transaction not found" }, { status: 404 });
  }

  const transfersCategory = await prisma.category.findFirst({
    where: householdId
      ? { householdId, name: "Transfers" }
      : { userId: session.user.id, name: "Transfers" },
  });

  const transferCategoryId = transfersCategory?.id ?? null;

  // Link both transactions to each other and assign Transfers category
  await prisma.transaction.update({
    where: { id },
    data: {
      transferPairId: pairedTransactionId,
      ...(transferCategoryId ? { categoryId: transferCategoryId } : {}),
    },
  });

  await prisma.transaction.update({
    where: { id: pairedTransactionId },
    data: {
      transferPairId: id,
      ...(transferCategoryId ? { categoryId: transferCategoryId } : {}),
    },
  });

  return NextResponse.json({ success: true });
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
    return NextResponse.json({ error: "Transaction not found" }, { status: 404 });
  }

  const pairedId = tx.transferPairId;

  // Unlink this transaction
  await prisma.transaction.update({
    where: { id },
    data: { transferPairId: null },
  });

  // Unlink the paired transaction if it exists
  if (pairedId) {
    const paired = await prisma.transaction.findUnique({ where: { id: pairedId } });
    if (paired && paired.transferPairId === id) {
      await prisma.transaction.update({
        where: { id: pairedId },
        data: { transferPairId: null },
      });
    }
  }

  return NextResponse.json({ success: true });
}
