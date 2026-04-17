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
 * Also maps well-known subscription services to canonical names.
 */
export function normalizeMerchant(description: string): string {
  let d = description.trim();

  // Canonical subscription service mappings (check early, before stripping)
  const upper = d.toUpperCase();

  if (/NETFLIX/i.test(d)) return "Netflix";
  if (/SPOTIFY/i.test(d)) return "Spotify";
  if (/APPLE\.COM\/BILL|APPLE\.COM BILL/i.test(d)) return "Apple";
  if (/AMAZON\s*PRIME/i.test(d)) return "Amazon Prime";
  if (/GOOGLE\s*\*/i.test(d)) return "Google";
  if (/\bHULU\b/i.test(d)) return "Hulu";
  if (/DISNEY\+|DISNEYPLUS/i.test(d)) return "Disney+";
  if (/YOUTUBE\s*PREMIUM/i.test(d)) return "YouTube Premium";
  if (/\bOPENAI\b/i.test(d)) return "OpenAI";
  if (/\bPERPLEXITY\b/i.test(d)) return "Perplexity";
  if (/\bGYMPASS\b/i.test(d)) return "Gympass";
  if (/T-MOBILE|TMOBILE/i.test(d)) return "T-Mobile";

  // Strip common noisy prefixes
  d = d.replace(/^(SQ \*|TST\*|SP |IC\* |DLO\*)/i, "");
  d = d.replace(/^(VISA|MASTERCARD|AMEX|DEBIT CARD|TSF |DDA |ACH |POS |PAYMENT |TFL |CID\*|WWW\.)/i, "");

  // Strip trailing ref numbers and identifiers
  d = d.replace(/\s+\d{6,}$/, "");
  d = d.replace(/\s+(REF|TXN|ID|NO)[:\s]*\w+$/i, "");
  d = d.replace(/\s+#\w+$/, "");

  // Collapse whitespace
  d = d.trim().replace(/\s+/g, " ");

  void upper; // used in early return branches above
  return d.length > 0 ? d : description;
}

/**
 * Detect potential transfer pairs across all household accounts.
 *
 * Looks for a transaction with the opposite isCredit flag, same amount, within ±3 days.
 * Uses householdAccountIds so cross-partner transfers are detected (e.g. Hasan pays
 * Matsu's credit card — debit on his checking, credit on her card).
 *
 * When multiple candidates exist (e.g. two £500 payments in the same week), picks
 * the one closest in date rather than first-found.
 */
export async function detectTransferPair(
  householdAccountIds: string[],
  amount: number,
  date: Date,
  isCredit: boolean,
  excludeTransactionId?: string
): Promise<string | null> {
  const windowStart = new Date(date);
  windowStart.setDate(windowStart.getDate() - 3);
  const windowEnd = new Date(date);
  windowEnd.setDate(windowEnd.getDate() + 3);

  const candidates = await prisma.transaction.findMany({
    where: {
      accountId: { in: householdAccountIds },
      amount,
      isCredit: !isCredit,
      date: { gte: windowStart, lte: windowEnd },
      transferPairId: null,
      id: excludeTransactionId ? { not: excludeTransactionId } : undefined,
    },
  });

  if (candidates.length === 0) return null;

  // Pick closest date match to avoid mispairings when multiple same-amount transfers exist
  candidates.sort(
    (a, b) =>
      Math.abs(a.date.getTime() - date.getTime()) -
      Math.abs(b.date.getTime() - date.getTime())
  );

  return candidates[0].id;
}
