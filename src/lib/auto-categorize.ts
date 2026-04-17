import { prisma } from "./prisma";

/**
 * Apply category rules to a description and return the matching categoryId, or null.
 * Tries exact/substring match first, then regex rules, ordered by priority DESC.
 */
export async function autoCategorize(
  userId: string,
  description: string
): Promise<string | null> {
  const rules = await prisma.categoryRule.findMany({
    where: { userId },
    orderBy: { priority: "desc" },
  });

  const upper = description.toUpperCase();

  for (const rule of rules) {
    if (rule.isRegex) {
      try {
        const re = new RegExp(rule.pattern, "i");
        if (re.test(description)) return rule.categoryId;
      } catch {
        // Invalid regex — skip
      }
    } else {
      if (upper.includes(rule.pattern.toUpperCase())) return rule.categoryId;
    }
  }

  return null;
}

/**
 * Normalize a merchant name from a raw bank description.
 * Strips common prefixes (VISA, MASTERCARD, SQ *, etc.) and trailing noise.
 */
export function normalizeMerchant(description: string): string {
  let d = description;

  // Strip leading payment network noise
  d = d.replace(/^(VISA|MASTERCARD|AMEX|DEBIT CARD|SQ \*|TSF |DDA |ACH |POS |PAYMENT |TFL |CID\*|SP |WWW\.)/i, "");

  // Strip trailing ref numbers
  d = d.replace(/\s+\d{6,}$/, "");
  d = d.replace(/\s+(REF|TXN|ID|NO)[:\s]*\w+$/i, "");

  // Collapse whitespace and title-case
  d = d.trim().replace(/\s+/g, " ");

  return d.length > 0 ? d : description;
}

/**
 * Detect potential transfer pairs across accounts.
 * Looks for transactions of the same amount ±1 day apart, one credit one debit.
 */
export async function detectTransferPair(
  userId: string,
  amount: number,
  date: Date,
  isCredit: boolean,
  excludeTransactionId?: string
): Promise<string | null> {
  const dayBefore = new Date(date);
  dayBefore.setDate(dayBefore.getDate() - 2);
  const dayAfter = new Date(date);
  dayAfter.setDate(dayAfter.getDate() + 2);

  const candidate = await prisma.transaction.findFirst({
    where: {
      account: { userId },
      amount,
      isCredit: !isCredit, // opposite direction
      date: { gte: dayBefore, lte: dayAfter },
      transferPairId: null, // not already paired
      id: excludeTransactionId ? { not: excludeTransactionId } : undefined,
    },
    orderBy: { date: "asc" },
  });

  return candidate?.id ?? null;
}
