import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getHouseholdAccountIds } from "@/lib/household";
import { normalizeMerchantHardcoded } from "@/lib/auto-categorize";

/**
 * Re-run merchant-name normalization on every transaction in the household.
 * Safe to call repeatedly — only writes when the normalized name differs.
 * Respects user-edited aliases stored in MerchantAlias.
 */
export async function POST() {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const userId = session.user.id;
  const accountIds = await getHouseholdAccountIds(userId);

  const [transactions, aliases] = await Promise.all([
    prisma.transaction.findMany({
      where: { accountId: { in: accountIds } },
      select: { id: true, description: true, merchant: true },
    }),
    prisma.merchantAlias.findMany({
      where: { userId },
      select: { fromName: true, toName: true },
    }),
  ]);

  const aliasMap = new Map(aliases.map((a) => [a.fromName, a.toName]));

  let updated = 0;
  const updates: Array<{ id: string; merchant: string }> = [];
  for (const tx of transactions) {
    const hardcoded = normalizeMerchantHardcoded(tx.description);
    const finalName = aliasMap.get(hardcoded) ?? hardcoded;
    if (finalName !== tx.merchant) {
      updates.push({ id: tx.id, merchant: finalName });
    }
  }

  if (updates.length > 0) {
    await prisma.$transaction(
      updates.map((u) =>
        prisma.transaction.update({
          where: { id: u.id },
          data: { merchant: u.merchant },
        }),
      ),
    );
    updated = updates.length;
  }

  return NextResponse.json({ updated, total: transactions.length });
}
