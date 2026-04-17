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

  // ── Canonical mappings ──────────────────────────────────────────────────────
  // Check before stripping so we match the full raw string.
  if (/NETFLIX/i.test(d)) return "Netflix";
  if (/SPOTIFY/i.test(d)) return "Spotify";
  if (/APPLE\.COM[/ ]BILL|APPLE\.COM BILL/i.test(d)) return "Apple";
  if (/AMAZON\s*PRIME/i.test(d)) return "Amazon Prime";
  if (/\bAMAZON\b/i.test(d)) return "Amazon";
  if (/GOOGLE\s*\*/i.test(d)) return "Google";
  if (/\bHULU\b/i.test(d)) return "Hulu";
  if (/DISNEY\+|DISNEYPLUS/i.test(d)) return "Disney+";
  if (/YOUTUBE\s*PREMIUM/i.test(d)) return "YouTube Premium";
  if (/\bYOUTUBE\b/i.test(d)) return "YouTube";
  if (/\bOPENAI\b/i.test(d)) return "OpenAI";
  if (/\bPERPLEXITY\b/i.test(d)) return "Perplexity";
  if (/\bGYMPASS\b/i.test(d)) return "Gympass";
  if (/T-MOBILE|TMOBILE/i.test(d)) return "T-Mobile";
  if (/\bUBER\s*EATS\b/i.test(d)) return "Uber Eats";
  if (/\bUBER\b/i.test(d)) return "Uber";
  if (/\bLYFT\b/i.test(d)) return "Lyft";
  if (/\bDOORDASH\b/i.test(d)) return "DoorDash";
  if (/\bGRUBHUB\b/i.test(d)) return "Grubhub";
  if (/\bSTARBUCKS\b/i.test(d)) return "Starbucks";
  if (/\bCHIPOTLE\b/i.test(d)) return "Chipotle";
  if (/WHOLE\s*FOODS/i.test(d)) return "Whole Foods";
  if (/TRADER\s*JOE/i.test(d)) return "Trader Joe's";
  if (/\bWALMART\b/i.test(d)) return "Walmart";
  if (/\bTARGET\b/i.test(d)) return "Target";
  if (/\bCOSTCO\b/i.test(d)) return "Costco";
  if (/\bCVS\b/i.test(d)) return "CVS";
  if (/\bWALGREENS\b/i.test(d)) return "Walgreens";
  if (/\bZELLE\b/i.test(d)) return "Zelle";
  if (/\bVENMO\b/i.test(d)) return "Venmo";
  if (/\bCASH\s*APP\b/i.test(d)) return "Cash App";
  if (/PAYPAL\s*\*(.+)/i.test(d)) {
    // "PAYPAL *ETSYSELLER" → extract the passthrough merchant
    const inner = d.match(/PAYPAL\s*\*(.+)/i)?.[1]?.trim();
    if (inner && inner.length >= 3) return inner;
    return "PayPal";
  }

  // ── Strip noisy prefixes ─────────────────────────────────────────────────────
  // Point-of-sale / payment processor prefixes
  d = d.replace(/^(SQ \*|TST\*|SP \*?|IC\* |DLO\*|SMB\*|LNK\*|PMT\*)/i, "");
  // Card network / bank channel prefixes
  d = d.replace(/^(VISA\s*(PURCH|DEBIT)?|MASTERCARD|AMEX|DEBIT CARD PURCHASE|DEBIT PURCHASE)\s*/i, "");
  // ACH / bank transfer noise
  d = d.replace(/^(TSF |DDA |ACH |POS |TFL |CID\*|WWW\.|CHECKCARD\s*|PURCHASE\s*)/i, "");
  // "BP#12345678" → "BP" — strip inline ref numbers attached with # or *
  d = d.replace(/[#*]\d{4,}/g, "");
  // Strip city/state suffix: "STARBUCKS 12345 NEW YORK NY" → "STARBUCKS 12345"
  d = d.replace(/\s+[A-Z]{2}\s*$/, "");
  // Strip trailing store numbers, ref numbers, long digit strings
  d = d.replace(/\s+\d{5,}$/, "");
  d = d.replace(/\s+(REF|TXN|ID|CONF|NO|AUTH)[:\s#]*[\w-]+$/i, "");
  d = d.replace(/\s+#[\w-]+$/, "");

  // Collapse whitespace
  d = d.trim().replace(/\s+/g, " ");

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
