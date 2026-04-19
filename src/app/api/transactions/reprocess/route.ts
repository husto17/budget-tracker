import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getHouseholdAccountIds } from "@/lib/household";
import { normalizeMerchantHardcoded } from "@/lib/auto-categorize";
import { ensureDefaultCategories } from "@/lib/default-categories";

/**
 * Re-run merchant-name normalization on every transaction in the household,
 * and auto-apply user category rules to any currently-uncategorized transaction.
 * Safe to call repeatedly — only writes when something actually changes.
 * Respects user-edited aliases in MerchantAlias.
 */
export async function POST() {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const userId = session.user.id;

  // Make sure default categories + starter rules are present before matching.
  await ensureDefaultCategories(userId);

  const accountIds = await getHouseholdAccountIds(userId);

  const [transactions, aliases, rules] = await Promise.all([
    prisma.transaction.findMany({
      where: { accountId: { in: accountIds }, deletedAt: null },
      select: { id: true, description: true, merchant: true, categoryId: true },
    }),
    prisma.merchantAlias.findMany({
      where: { userId },
      select: { fromName: true, toName: true },
    }),
    prisma.categoryRule.findMany({
      where: { userId },
      orderBy: { priority: "desc" },
      select: { categoryId: true, pattern: true, isRegex: true },
    }),
  ]);

  const aliasMap = new Map(aliases.map((a) => [a.fromName, a.toName]));

  function matchRule(description: string): string | null {
    const upper = description.toUpperCase();
    for (const r of rules) {
      if (r.isRegex) {
        try {
          if (new RegExp(r.pattern, "i").test(description)) return r.categoryId;
        } catch {
          // bad regex — skip
        }
      } else if (upper.includes(r.pattern.toUpperCase())) {
        return r.categoryId;
      }
    }
    return null;
  }

  let renamed = 0;
  let categorized = 0;

  const updates: Array<{ id: string; data: { merchant?: string; categoryId?: string } }> = [];
  for (const tx of transactions) {
    const hardcoded = normalizeMerchantHardcoded(tx.description);
    const finalName = aliasMap.get(hardcoded) ?? hardcoded;
    const data: { merchant?: string; categoryId?: string } = {};
    if (finalName !== tx.merchant) {
      data.merchant = finalName;
      renamed++;
    }
    if (!tx.categoryId) {
      const categoryId = matchRule(tx.description);
      if (categoryId) {
        data.categoryId = categoryId;
        categorized++;
      }
    }
    if (data.merchant !== undefined || data.categoryId !== undefined) {
      updates.push({ id: tx.id, data });
    }
  }

  // Sequential so we don't hit the Neon HTTP "transactions not supported" error.
  for (const u of updates) {
    await prisma.transaction.update({ where: { id: u.id }, data: u.data });
  }

  return NextResponse.json({
    updated: updates.length,
    renamed,
    categorized,
    total: transactions.length,
  });
}
