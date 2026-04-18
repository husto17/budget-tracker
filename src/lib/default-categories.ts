import { prisma } from "./prisma";

export const DEFAULT_CATEGORIES = [
  { name: "Groceries", color: "#22C55E", icon: "shopping-cart" },
  { name: "Dining Out", color: "#F97316", icon: "utensils" },
  { name: "Transport", color: "#3B82F6", icon: "car" },
  { name: "Travel", color: "#0EA5E9", icon: "plane" },
  { name: "Utilities", color: "#8B5CF6", icon: "zap" },
  { name: "Rent", color: "#EF4444", icon: "home" },
  { name: "Home", color: "#78350F", icon: "sofa" },
  { name: "Entertainment", color: "#EC4899", icon: "tv" },
  { name: "Shopping", color: "#F59E0B", icon: "shopping-bag" },
  { name: "Clothing", color: "#D946EF", icon: "shirt" },
  { name: "Personal Care", color: "#F43F5E", icon: "scissors" },
  { name: "Health", color: "#10B981", icon: "heart" },
  { name: "Education", color: "#EAB308", icon: "graduation-cap" },
  { name: "Subscriptions", color: "#6366F1", icon: "repeat" },
  { name: "Gifts", color: "#A855F7", icon: "gift" },
  { name: "Family Support", color: "#14B8A6", icon: "heart-handshake" },
  { name: "Charity", color: "#84CC16", icon: "hand-heart" },
  { name: "Income", color: "#059669", icon: "trending-up" },
  { name: "Savings", color: "#06B6D4", icon: "piggy-bank" },
  { name: "Taxes", color: "#475569", icon: "landmark" },
  { name: "Transfers", color: "#6B7280", icon: "arrow-right-left" },
  { name: "Fees & Interest", color: "#DC2626", icon: "percent" },
  { name: "Other", color: "#9CA3AF", icon: "circle" },
];

// Starter auto-categorize rules seeded alongside the default categories.
// These match against the raw transaction description (case-insensitive substring).
// Intentionally small — ~6–10 obvious patterns per category. Every manual
// category assignment also creates a rule, so the list grows naturally per
// user rather than shipping with a wall of defaults.
export const DEFAULT_RULES: Record<string, string[]> = {
  Groceries: [
    "TRADER JOE", "WHOLE FOODS", "ALDI", "KROGER", "SAFEWAY",
    "JEWEL OSCO", "INSTACART",
  ],
  "Dining Out": [
    "STARBUCKS", "CHIPOTLE", "DOORDASH", "GRUBHUB", "UBER EATS",
    "PIZZERIA", "RESTAURANT", "COFFEE", "CAFE",
  ],
  Transport: [
    "UBER", "LYFT", "CURB", "AMTRAK", "PARKING", "TOLL", "METRA", "CTA",
  ],
  Travel: [
    "AIRLINES", "AIR CANADA", "BRITISH AIR", "DELTA AIR", "UNITED AIR",
    "AMERICAN AIR", "JETBLUE", "SOUTHWEST", "MARRIOTT", "HILTON",
    "HYATT", "AIRBNB", "BOOKING.COM", "EXPEDIA", "HOTELS.COM",
    "HERTZ", "ENTERPRISE RENT", "AVIS",
  ],
  Utilities: [
    "COMED", "PEOPLES GAS", "XFINITY", "COMCAST", "VERIZON", "T-MOBILE",
  ],
  Rent: ["RENT PAYMENT", "LANDLORD"],
  Home: [
    "HOME DEPOT", "LOWE'S", "LOWES", "IKEA", "WEST ELM", "CRATE AND BARREL",
    "WAYFAIR", "POTTERY BARN", "CB2",
  ],
  Entertainment: [
    "NETFLIX", "HULU", "STUBHUB", "TICKETMASTER", "THEATRE", "CINEMA",
  ],
  Shopping: [
    "AMAZON", "TARGET", "WALMART", "COSTCO", "USPS", "FEDEX", "UPS ",
    "BEST BUY", "ETSY",
  ],
  Clothing: [
    "LULULEMON", "VUORI", "ALO YOGA", "NIKE", "ADIDAS", "PATAGONIA",
    "ARC'TERYX", "RAG & BONE", "THEORY", "EVERLANE", "APC", "ACNE",
    "COS ", "UNIQLO", "ZARA", "NORDSTROM", "SSENSE", "MR PORTER",
  ],
  "Personal Care": [
    "SEPHORA", "ULTA", "AESOP", "LUSH", "GLOSSIER", "BARBER",
    "SALON", "HAIR", "NAIL", "WAX", "LASER",
  ],
  Health: [
    "CVS", "WALGREENS", "PHARMACY", "DENTAL", "DENTIST", "HOSPITAL",
    "CLINIC", "ONE MEDICAL", "ZOCDOC",
  ],
  Education: [
    "BOOTH", "TUITION", "UNIVERSITY", "COLLEGE", "COURSERA",
    "UDEMY", "MASTERCLASS", "TEXTBOOK",
  ],
  Subscriptions: [
    "SPOTIFY", "APPLE.COM/BILL", "OPENAI", "NYTIMES", "DROPBOX",
    "GOOGLE ONE", "ICLOUD",
  ],
  Gifts: [],
  "Family Support": [],
  Charity: [
    "GOFUNDME", "DONATIONS", "RED CROSS", "UNICEF", "MSF",
    "WIKIPEDIA",
  ],
  Savings: [
    "VANGUARD", "FIDELITY", "SCHWAB", "ROBINHOOD", "WEALTHFRONT",
    "BETTERMENT", "ACORNS",
  ],
  Taxes: [
    "IRS", "TAX PAYMENT", "FRANCHISE TAX", "STATE TAX", "TURBOTAX",
  ],
  Income: [
    "DIRECT DEPOSIT", "PAYROLL", "SALARY",
  ],
  Transfers: [
    "ZELLE", "VENMO", "CASH APP", "PAYMENT FROM CHK", "PAYMENT TO CHK",
    "ONLINE TRANSFER",
  ],
  "Fees & Interest": [
    "INTEREST CHARGE", "FOREIGN TRANSACTION", "LATE FEE", "OVERDRAFT",
    "ATM FEE",
  ],
};

// Renames of default categories over time — older installs get migrated
// transparently on the next GET /api/categories.
const CATEGORY_RENAMES: Array<{ from: string; to: string }> = [
  { from: "Rent / Mortgage", to: "Rent" },
  { from: "Transportation", to: "Transport" },
];

// Creates any default categories the user is missing, and seeds starter rules
// for newly-created categories. Safe to call repeatedly — e.g. on every
// GET /api/categories — so existing users pick up newly-added defaults without
// a migration.
export async function ensureDefaultCategories(userId: string): Promise<void> {
  // Apply any pending renames first so we don't end up with duplicates when
  // the new name tries to get inserted below.
  for (const r of CATEGORY_RENAMES) {
    const fromCat = await prisma.category.findFirst({
      where: { userId, name: r.from, isDefault: true },
      select: { id: true },
    });
    if (!fromCat) continue;
    const toCat = await prisma.category.findFirst({
      where: { userId, name: r.to },
      select: { id: true },
    });
    if (toCat) {
      // Target already exists — move transactions/rules then drop the old row.
      // Sequential because the Neon HTTP adapter doesn't support interactive txns.
      await prisma.transaction.updateMany({
        where: { categoryId: fromCat.id },
        data: { categoryId: toCat.id },
      });
      await prisma.categoryRule.updateMany({
        where: { categoryId: fromCat.id },
        data: { categoryId: toCat.id },
      });
      await prisma.category.delete({ where: { id: fromCat.id } });
    } else {
      await prisma.category.update({
        where: { id: fromCat.id },
        data: { name: r.to },
      });
    }
  }

  const existing = await prisma.category.findMany({
    where: { userId, name: { in: DEFAULT_CATEGORIES.map((c) => c.name) } },
    select: { id: true, name: true },
  });
  const have = new Set(existing.map((c) => c.name));
  const missing = DEFAULT_CATEGORIES.filter((c) => !have.has(c.name));

  let newCategories = existing;
  if (missing.length > 0) {
    // Sequential .create() avoids the "transactions not supported in HTTP mode"
    // error that Prisma's createMany triggers against the Neon HTTP adapter.
    for (const c of missing) {
      await prisma.category.create({
        data: { ...c, userId, isDefault: true },
      });
    }
    newCategories = await prisma.category.findMany({
      where: { userId, name: { in: DEFAULT_CATEGORIES.map((c) => c.name) } },
      select: { id: true, name: true },
    });
  }

  // Seed starter rules for any default category that has no rules yet.
  // Users who already have custom rules aren't touched; missing rules get added.
  const existingRules = await prisma.categoryRule.findMany({
    where: { userId, categoryId: { in: newCategories.map((c) => c.id) } },
    select: { categoryId: true, pattern: true },
  });
  const rulesByCategory = new Map<string, Set<string>>();
  for (const r of existingRules) {
    if (!rulesByCategory.has(r.categoryId)) rulesByCategory.set(r.categoryId, new Set());
    rulesByCategory.get(r.categoryId)!.add(r.pattern.toUpperCase());
  }

  const ruleRows: Array<{ userId: string; categoryId: string; pattern: string }> = [];
  for (const cat of newCategories) {
    const patterns = DEFAULT_RULES[cat.name];
    if (!patterns) continue;
    const already = rulesByCategory.get(cat.id) ?? new Set();
    for (const p of patterns) {
      if (!already.has(p.toUpperCase())) {
        ruleRows.push({ userId, categoryId: cat.id, pattern: p });
      }
    }
  }
  for (const r of ruleRows) {
    await prisma.categoryRule.create({ data: r });
  }
}
