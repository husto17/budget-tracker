import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getHouseholdAccountIds, getHouseholdId } from "@/lib/household";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;

  const householdId = await getHouseholdId(session.user.id);
  const category = await prisma.category.findUnique({
    where: { id },
    include: { rules: true },
  });
  const accessible = category && (
    (householdId && category.householdId === householdId) ||
    category.userId === session.user.id
  );
  if (!accessible) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  if (category.rules.length === 0) {
    return NextResponse.json({ updated: 0 });
  }

  const accountIds = await getHouseholdAccountIds(session.user.id);

  // Get all transactions in household that don't already have this category
  const transactions = await prisma.transaction.findMany({
    where: {
      accountId: { in: accountIds },
      categoryId: { not: id },
      deletedAt: null,
    },
    select: { id: true, description: true },
  });

  const toUpdate: string[] = [];
  for (const tx of transactions) {
    for (const rule of category.rules) {
      let matches = false;
      if (rule.isRegex) {
        try {
          matches = new RegExp(rule.pattern, "i").test(tx.description);
        } catch {
          // invalid regex — skip
        }
      } else {
        matches = tx.description.toLowerCase().includes(rule.pattern.toLowerCase());
      }
      if (matches) {
        toUpdate.push(tx.id);
        break;
      }
    }
  }

  // Update matching transactions sequentially (no $transaction per constraints)
  for (const txId of toUpdate) {
    await prisma.transaction.update({
      where: { id: txId },
      data: { categoryId: id },
    });
  }

  return NextResponse.json({ updated: toUpdate.length });
}
