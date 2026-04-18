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
  let data: Record<string, unknown>;
  try {
    data = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const householdAccountIds = await getHouseholdAccountIds(session.user.id);
  const tx = await prisma.transaction.findUnique({ where: { id } });
  if (!tx || !householdAccountIds.includes(tx.accountId)) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // If merchant is being renamed, save the alias so future uploads auto-apply it.
  // Wrapped so a learning failure never blocks the update.
  if (
    typeof data.merchant === "string" &&
    data.merchant !== tx.merchant &&
    tx.merchant
  ) {
    try {
      await prisma.merchantAlias.upsert({
        where: { userId_fromName: { userId: session.user.id, fromName: tx.merchant } },
        update: { toName: data.merchant },
        create: { userId: session.user.id, fromName: tx.merchant, toName: data.merchant },
      });
    } catch (err) {
      console.error("Failed to save merchant alias", err);
    }
  }

  let updated;
  try {
    updated = await prisma.transaction.update({
      where: { id },
      data: {
        categoryId:
          data.categoryId !== undefined ? ((data.categoryId as string) || null) : undefined,
        notes: data.notes !== undefined ? (data.notes as string | null) : undefined,
        description: data.description !== undefined ? (data.description as string) : undefined,
        merchant: data.merchant !== undefined ? (data.merchant as string) : undefined,
        amount: data.amount !== undefined ? parseFloat(String(data.amount)) : undefined,
        date: data.date !== undefined ? new Date(String(data.date)) : undefined,
      },
      include: { category: true, account: { select: { id: true, name: true, type: true } } },
    });
  } catch (err) {
    console.error("Failed to update transaction", err, { id, data });
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to update transaction" },
      { status: 500 },
    );
  }

  // If the user set (or changed) the category, remember that decision as a rule
  // keyed by merchant name — so next time we see the same merchant it auto-fills.
  // One rule per merchant: we move it to the new category rather than creating duplicates.
  // Wrapped in try/catch so a learning failure never blocks the user's category change.
  const categoryId = typeof data.categoryId === "string" ? data.categoryId : null;
  if (categoryId && updated.merchant && updated.merchant.trim().length >= 3) {
    try {
      const pattern = updated.merchant.trim();
      const existing = await prisma.categoryRule.findFirst({
        where: { userId: session.user.id, pattern, isRegex: false },
      });
      if (!existing) {
        await prisma.categoryRule.create({
          data: {
            userId: session.user.id,
            categoryId,
            pattern,
            isRegex: false,
          },
        });
      } else if (existing.categoryId !== categoryId) {
        await prisma.categoryRule.update({
          where: { id: existing.id },
          data: { categoryId },
        });
      }
    } catch (err) {
      console.error("Failed to learn category rule", err);
    }
  }

  // If amount was changed on a linked transfer, mirror the new amount to the
  // paired side so the two don't diverge.
  if (data.amount !== undefined && tx.transferPairId) {
    try {
      await prisma.transaction.update({
        where: { id: tx.transferPairId },
        data: { amount: parseFloat(String(data.amount)) },
      });
    } catch (err) {
      console.error("Failed to mirror transfer amount", err);
    }
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
