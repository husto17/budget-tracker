import "dotenv/config";
import { prisma } from "../src/lib/prisma";
import { ensureDefaultCategories } from "../src/lib/default-categories";
import { normalizeMerchantHardcoded } from "../src/lib/auto-categorize";

async function main() {
  const users = await prisma.user.findMany({ select: { id: true, email: true } });
  console.log(`Found ${users.length} users`);

  for (const user of users) {
    console.log(`\n→ ${user.email} (${user.id})`);
    await ensureDefaultCategories(user.id);

    const accounts = await prisma.account.findMany({
      where: { userId: user.id },
      select: { id: true },
    });
    const accountIds = accounts.map((a) => a.id);
    if (accountIds.length === 0) {
      console.log("  no accounts — skipping");
      continue;
    }

    const [transactions, aliases, rules] = await Promise.all([
      prisma.transaction.findMany({
        where: { accountId: { in: accountIds } },
        select: { id: true, description: true, merchant: true, categoryId: true },
      }),
      prisma.merchantAlias.findMany({
        where: { userId: user.id },
        select: { fromName: true, toName: true },
      }),
      prisma.categoryRule.findMany({
        where: { userId: user.id },
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
          } catch {}
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

    for (const u of updates) {
      await prisma.transaction.update({ where: { id: u.id }, data: u.data });
    }

    console.log(`  ${transactions.length} transactions — renamed ${renamed}, categorized ${categorized}`);
  }

  await prisma.$disconnect();
  console.log("\n✓ done");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
