import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getHouseholdAccountIds } from "@/lib/household";

// One-time data reset: wipes all transaction, category, rule, alias, and upload
// data for the household. Users and accounts are preserved.
export async function POST() {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const accountIds = await getHouseholdAccountIds(session.user.id);

  const user = await prisma.user.findUnique({ where: { id: session.user.id }, select: { householdId: true } });
  const partnerUserId = await (async () => {
    if (!user?.householdId) return null;
    const p = await prisma.user.findFirst({ where: { householdId: user.householdId, id: { not: session.user.id } }, select: { id: true } });
    return p?.id ?? null;
  })();
  const userIds = partnerUserId ? [session.user.id, partnerUserId] : [session.user.id];

  // Delete in dependency order (children before parents)
  await prisma.reimbursement.deleteMany({ where: { userId: { in: userIds } } });
  await prisma.transactionTag.deleteMany({ where: { transaction: { accountId: { in: accountIds } } } });
  await prisma.transactionSplit.deleteMany({ where: { transaction: { accountId: { in: accountIds } } } });
  await prisma.transaction.deleteMany({ where: { accountId: { in: accountIds } } });
  // Delete by householdId when set — covers records owned by either partner.
  const householdId = user?.householdId;
  if (householdId) {
    await prisma.categoryRule.deleteMany({ where: { householdId } });
    await prisma.category.deleteMany({ where: { householdId } });
    await prisma.merchantAlias.deleteMany({ where: { householdId } });
  } else {
    await prisma.categoryRule.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.category.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.merchantAlias.deleteMany({ where: { userId: { in: userIds } } });
  }
  await prisma.upload.deleteMany({ where: { userId: { in: userIds } } });

  return NextResponse.json({ success: true });
}
