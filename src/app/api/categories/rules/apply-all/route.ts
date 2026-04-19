import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getHouseholdAccountIds, getHouseholdCategoryOwnerId } from "@/lib/household";

export async function POST(_request: Request) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const userId = session.user.id;
  const [accountIds, ownerId] = await Promise.all([
    getHouseholdAccountIds(userId),
    getHouseholdCategoryOwnerId(userId),
  ]);

  // Get all categories with rules, ordered by priority (higher first)
  const categories = await prisma.category.findMany({
    where: { userId: ownerId },
    include: {
      rules: {
        orderBy: { priority: "desc" },
      },
    },
    orderBy: { rules: { _count: "desc" } },
  });

  const categoriesWithRules = categories.filter((c) => c.rules.length > 0);

  if (categoriesWithRules.length === 0) {
    return NextResponse.json({ updated: 0 });
  }

  // Get all uncategorized transactions in household
  const transactions = await prisma.transaction.findMany({
    where: {
      accountId: { in: accountIds },
      categoryId: null,
      deletedAt: null,
    },
    select: { id: true, description: true },
  });

  let updated = 0;
  for (const tx of transactions) {
    for (const category of categoriesWithRules) {
      let matched = false;
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
          matched = true;
          break;
        }
      }
      if (matched) {
        await prisma.transaction.update({
          where: { id: tx.id },
          data: { categoryId: category.id },
        });
        updated++;
        break; // first matching category wins
      }
    }
  }

  return NextResponse.json({ updated });
}
