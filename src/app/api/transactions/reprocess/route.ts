import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getHouseholdAccountIds, getHouseholdCategoryOwnerId, getPartnerUserId } from "@/lib/household";
import { normalizeMerchantHardcoded } from "@/lib/auto-categorize";
import { ensureDefaultCategories, CATEGORY_RENAMES } from "@/lib/default-categories";

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
  const [ownerId, partnerUserId] = await Promise.all([
    getHouseholdCategoryOwnerId(userId),
    getPartnerUserId(userId),
  ]);
  // All household user IDs — used for category-rename sweep below.
  const allUserIds = partnerUserId ? [userId, partnerUserId] : [userId];

  // Seed/rename default categories for the canonical owner only.
  // Running ensureDefaultCategories for the partner risks recreating their
  // categories if the household merge has already emptied their namespace.
  try { await ensureDefaultCategories(ownerId); } catch (e) {
    console.error("ensureDefaultCategories failed", e);
  }

  // Apply all CATEGORY_RENAMES for every household user — safe because it
  // only acts when the old-name category actually exists.
  for (const rename of CATEGORY_RENAMES) {
    for (const uid of allUserIds) {
      try {
        const fromCat = await prisma.category.findFirst({ where: { userId: uid, name: rename.from }, select: { id: true } });
        if (!fromCat) continue;
        const toCat = await prisma.category.findFirst({ where: { userId: uid, name: rename.to }, select: { id: true } });
        if (toCat) {
          await prisma.transaction.updateMany({ where: { categoryId: fromCat.id }, data: { categoryId: toCat.id } });
          await prisma.categoryRule.updateMany({ where: { categoryId: fromCat.id }, data: { categoryId: toCat.id } });
          await prisma.category.delete({ where: { id: fromCat.id } });
        } else {
          await prisma.category.update({ where: { id: fromCat.id }, data: { name: rename.to } });
        }
      } catch (e) {
        console.error(`Category rename ${rename.from}→${rename.to} failed for ${uid}`, e);
      }
    }
  }

  const accountIds = await getHouseholdAccountIds(userId);

  const [transactions, aliases, rules] = await Promise.all([
    prisma.transaction.findMany({
      where: { accountId: { in: accountIds }, deletedAt: null },
      select: { id: true, description: true, merchant: true, categoryId: true },
    }),
    prisma.merchantAlias.findMany({
      where: { userId: ownerId },
      select: { fromName: true, toName: true },
    }),
    prisma.categoryRule.findMany({
      where: { userId: ownerId },
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
