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

// ── Canonical well-known merchants ─────────────────────────────────────────
// Check before stripping so we match the full raw string.
const CANONICALS: Array<[RegExp, string]> = [
  [/NETFLIX/i, "Netflix"],
  [/SPOTIFY/i, "Spotify"],
  [/APPLE\.COM[/ ]?BILL/i, "Apple"],
  [/AMAZON\s*PRIME/i, "Amazon Prime"],
  [/\bAMAZON\b/i, "Amazon"],
  [/GOOGLE\s*\*/i, "Google"],
  [/\bHULU\b/i, "Hulu"],
  [/DISNEY\+|DISNEYPLUS/i, "Disney+"],
  [/YOUTUBE\s*PREMIUM/i, "YouTube Premium"],
  [/\bYOUTUBE\b/i, "YouTube"],
  [/\bOPENAI\b/i, "OpenAI"],
  [/\bPERPLEXITY\b/i, "Perplexity"],
  [/\bGYMPASS\b/i, "Gympass"],
  [/T-MOBILE|TMOBILE/i, "T-Mobile"],
  [/\bUBER\s*EATS\b/i, "Uber Eats"],
  [/\bUBER\b/i, "Uber"],
  [/\bLYFT\b/i, "Lyft"],
  [/\bCURB\b/i, "Curb"],
  [/\bDOORDASH\b/i, "DoorDash"],
  [/\bGRUBHUB\b/i, "Grubhub"],
  [/\bSTARBUCKS\b/i, "Starbucks"],
  [/\bCHIPOTLE\b/i, "Chipotle"],
  [/WHOLE\s*FOODS/i, "Whole Foods"],
  [/TRADER\s*JOE/i, "Trader Joe's"],
  [/\bWALMART\b/i, "Walmart"],
  [/\bTARGET\b/i, "Target"],
  [/\bCOSTCO\b/i, "Costco"],
  [/\bCVS\b/i, "CVS"],
  [/\bWALGREENS\b/i, "Walgreens"],
  [/\bZELLE\b/i, "Zelle"],
  [/\bVENMO\b/i, "Venmo"],
  [/\bCASH\s*APP\b/i, "Cash App"],
  [/\bUSPS\b/i, "USPS"],
  [/\bUPS\b/i, "UPS"],
  [/\bFEDEX\b/i, "FedEx"],
  [/\bSTUBHUB\b/i, "StubHub"],
  [/BATHANDBODYWORKS|BATH\s*&?\s*BODY\s*WORKS/i, "Bath & Body Works"],
  [/BLUE\s*BOTTLE\s*COFFEE/i, "Blue Bottle Coffee"],
  [/MUSIC\s*BOX\s*THEATRE/i, "Music Box Theatre"],
  [/PARCEL\s*PENDING/i, "Parcel Pending"],
  [/\bAESOP\b/i, "Aesop"],
  [/\bINSTACART\b/i, "Instacart"],
  [/LASERAWAY/i, "LaserAway"],
];

// Common US city names for trailing-city stripping. Uppercase-canonical.
const KNOWN_CITIES =
  "CHICAGO|NEW\\s+YORK|LOS\\s+ANGELES|SAN\\s+FRANCISCO|SAN\\s+DIEGO|SAN\\s+JOSE|SEATTLE|BOSTON|AUSTIN|MIAMI|HOUSTON|DALLAS|DENVER|ATLANTA|PORTLAND|PHOENIX|PHILADELPHIA|WASHINGTON|NASHVILLE|BROOKLYN|MANHATTAN|QUEENS|BRONX|OAKLAND|LONG\\s+BEACH|SACRAMENTO|MINNEAPOLIS|DETROIT|CLEVELAND|PITTSBURGH|TAMPA|ORLANDO|RALEIGH|CHARLOTTE|MILWAUKEE|BALTIMORE|INDIANAPOLIS|COLUMBUS|KANSAS\\s+CITY|ST\\s+LOUIS|CINCINNATI|SALT\\s+LAKE\\s+CITY|LAS\\s+VEGAS|HONOLULU|ANCHORAGE|NEWARK|JERSEY\\s+CITY";

// Processor/passthrough prefixes: the interesting merchant is after the prefix.
const PASSTHROUGH_RE =
  /^(?:PAYPAL\s*\*|SQ\s*\*\s*|TST\s*\*\s*|IC\s*\*\s*|HFD\s*\*\s*|SP\s*\*\s*|DLO\s*\*\s*|SMB\s*\*\s*|LNK\s*\*\s*|PMT\s*\*\s*|POS\s*\*\s*)(.+)$/i;

// Common US state abbreviations used to identify "<...> CITY ST" suffixes.
const STATE_ABBR =
  "AL|AK|AZ|AR|CA|CO|CT|DE|FL|GA|HI|ID|IL|IN|IA|KS|KY|LA|ME|MD|MA|MI|MN|MS|MO|MT|NE|NV|NH|NJ|NM|NY|NC|ND|OH|OK|OR|PA|RI|SC|SD|TN|TX|UT|VT|VA|WA|WV|WI|WY|DC";

function titleCaseIfAllCaps(s: string): string {
  // If the string is all uppercase (plus digits/punct), title-case it.
  if (/[A-Z]/.test(s) && !/[a-z]/.test(s)) {
    return s
      .toLowerCase()
      .replace(/\b([a-z])/g, (_, c: string) => c.toUpperCase())
      // Preserve well-known acronyms
      .replace(/\bUsps\b/g, "USPS")
      .replace(/\bUps\b/g, "UPS")
      .replace(/\bCvs\b/g, "CVS")
      .replace(/\bAtm\b/g, "ATM");
  }
  return s;
}

/**
 * Normalize a merchant name from a raw bank description.
 *
 * Pipeline:
 *  1. Canonical brand match on the raw string (handles "PAYPAL *STARBUCKS" → "Starbucks").
 *  2. Strip processor passthrough prefix (PAYPAL *, TST*, SQ *, HFD*, etc.) and recheck canonicals.
 *  3. Strip card-network / bank-channel prefixes.
 *  4. Strip trailing phone numbers, reference IDs, city + state suffix, store numbers.
 *  5. Title-case the result if it came back all-uppercase.
 *
 * Pure sync — no DB access. Call normalizeMerchant() (async) to also apply learned aliases.
 */
export function normalizeMerchantHardcoded(description: string): string {
  const original = description.trim();
  if (!original) return original;

  // 1. Canonical brand match on the raw string
  for (const [re, name] of CANONICALS) {
    if (re.test(original)) return name;
  }

  let d = original;

  // 2. Passthrough prefix — extract inner merchant, recheck canonicals
  const pass = d.match(PASSTHROUGH_RE);
  if (pass) {
    d = pass[1].trim();
    for (const [re, name] of CANONICALS) {
      if (re.test(d)) return name;
    }
  }

  // 3. Card-network / bank-channel / ACH prefixes
  d = d.replace(/^(VISA\s*(PURCH|DEBIT)?|MASTERCARD|AMEX|DEBIT\s*CARD\s*PURCHASE|DEBIT\s*PURCHASE)\s*/i, "");
  d = d.replace(/^(TSF\s|DDA\s|ACH\s|POS\s|TFL\s|CID\*|WWW\.|CHECKCARD\s*|PURCHASE\s*)/i, "");

  // 4. Strip trailing noise
  // Phone numbers: "312-555-1234", "(312) 555-1234", "312.555.1234", "855 977 1676"
  d = d.replace(/\s+\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}\b.*$/, "");
  // Inline ref numbers like "BP#12345678" or "BP*12345678"
  d = d.replace(/[#*]\d{4,}[\w-]*/g, "");
  // Hash-separated ref like "#15921" at end
  d = d.replace(/\s+#[\w-]+$/, "");
  // Explicit ref keywords
  d = d.replace(/\s+(REF|TXN|ID|CONF|NO|AUTH)[:\s#]*[\w-]+$/i, "");

  // Known ALLCAPS city + state — "CHICAGO IL", "NEW YORK NY"
  d = d.replace(new RegExp(`\\s+(?:${KNOWN_CITIES})\\s+(?:${STATE_ABBR})\\s*$`, "i"), "");
  // TitleCase city (1–2 words) + state — "Chicago IL", "San Francisco CA"
  d = d.replace(new RegExp(`\\s+[A-Z][a-z]+(?:\\s+[A-Z][a-z]+)?\\s+(?:${STATE_ABBR})\\s*$`), "");
  // Bare state — covers cases where the city got glued to a preceding word ("HALLCHICAGO IL")
  d = d.replace(new RegExp(`\\s+(?:${STATE_ABBR})\\s*$`), "");
  // Known city at end (possibly glued to preceding word) — "HALLCHICAGO" → "HALL"
  d = d.replace(new RegExp(`(?:${KNOWN_CITIES})\\s*$`, "i"), "");
  // Trailing long digit runs (store/ref numbers)
  d = d.replace(/\s+\d{5,}$/, "");

  // Collapse whitespace
  d = d.trim().replace(/\s+/g, " ");

  // 5. Title-case if all uppercase
  d = titleCaseIfAllCaps(d);

  return d.length > 0 ? d : original;
}

/**
 * Normalize a merchant name, applying hardcoded rules first then any user-learned aliases.
 * When a user edits a transaction's merchant field, the mapping is saved to MerchantAlias
 * and automatically applied to future transactions from the same merchant.
 */
export async function normalizeMerchant(userId: string, description: string): Promise<string> {
  const hardcoded = normalizeMerchantHardcoded(description);

  const alias = await prisma.merchantAlias.findUnique({
    where: { userId_fromName: { userId, fromName: hardcoded } },
  });

  return alias?.toName ?? hardcoded;
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
