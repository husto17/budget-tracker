import { prisma } from "./prisma";

export const DEFAULT_CATEGORIES = [
  { name: "Groceries", color: "#22C55E", icon: "shopping-cart" },
  { name: "Dining Out", color: "#F97316", icon: "utensils" },
  { name: "Transport", color: "#3B82F6", icon: "car" },
  { name: "Utilities", color: "#8B5CF6", icon: "zap" },
  { name: "Rent", color: "#EF4444", icon: "home" },
  { name: "Entertainment", color: "#EC4899", icon: "tv" },
  { name: "Shopping", color: "#F59E0B", icon: "shopping-bag" },
  { name: "Health", color: "#10B981", icon: "heart" },
  { name: "Subscriptions", color: "#6366F1", icon: "repeat" },
  { name: "Income", color: "#14B8A6", icon: "trending-up" },
  { name: "Transfers", color: "#6B7280", icon: "arrow-right-left" },
  { name: "Fees & Interest", color: "#DC2626", icon: "percent" },
  { name: "Other", color: "#9CA3AF", icon: "circle" },
];

// Starter auto-categorize rules seeded alongside the default categories.
// These match against the raw transaction description (case-insensitive substring).
// Keep patterns conservative — they should hit obvious merchants only; users
// can always add/remove their own.
export const DEFAULT_RULES: Record<string, string[]> = {
  Groceries: [
    "TRADER JOE", "WHOLE FOODS", "ALDI", "KROGER", "SAFEWAY", "PUBLIX",
    "H MART", "HMART", "JEWEL OSCO", "JEWEL-OSCO", "MARIANO", "WEGMANS",
    "SPROUTS", "COSTCO WHSE", "INSTACART",
  ],
  "Dining Out": [
    "STARBUCKS", "CHIPOTLE", "DOORDASH", "GRUBHUB", "UBER EATS", "UBEREATS",
    "PIZZERIA", "PIZZA", "CAFE", "COFFEE", "RESTAURANT", "BAR ", "GRILL",
    "TAQUERIA", "SUSHI", "RAMEN", "BISTRO", "CANTINA", "BBQ",
    "MCDONALD", "CHICK-FIL-A", "CHICKFIL", "PANERA", "SHAKE SHACK",
    "SWEETGREEN", "DUNKIN", "TST*", "SQ *",
  ],
  Transport: [
    "UBER", "LYFT", "METRA", "CTA", "AMTRAK", "DELTA AIR", "AMERICAN AIR",
    "UNITED AIR", "SOUTHWEST", "SPIRIT AIR", "JETBLUE", "SHELL", "EXXON",
    "CHEVRON", "BP ", "MOBIL", "SUNOCO", "PARKING", "TOLL",
  ],
  Utilities: [
    "COMED", "PEOPLES GAS", "PEOPLESGAS", "NICOR", "CONED", "PG&E",
    "XFINITY", "COMCAST", "VERIZON", "AT&T", "T-MOBILE", "TMOBILE",
    "SPECTRUM", "INTERNET", "ELECTRIC", "WATER BILL",
  ],
  Rent: ["RENT PAYMENT", "LANDLORD", "HOA"],
  Entertainment: [
    "NETFLIX", "HULU", "DISNEY+", "DISNEYPLUS", "HBO", "MAX ",
    "YOUTUBE", "PARAMOUNT", "PEACOCK", "APPLE TV", "STUBHUB",
    "TICKETMASTER", "LIVE NATION", "AMC THEATRES", "MUSIC BOX",
    "CINEMA", "THEATRE",
  ],
  Shopping: [
    "AMAZON", "TARGET", "WALMART", "COSTCO", "BEST BUY", "HOME DEPOT",
    "LOWES", "IKEA", "MACY", "NORDSTROM", "GAP ", "OLD NAVY",
    "BATH & BODY", "BATHANDBODY", "SEPHORA", "ULTA", "ETSY",
  ],
  Health: [
    "CVS", "WALGREENS", "RITE AID", "PHARMACY", "HOSPITAL", "CLINIC",
    "DOCTOR", "DENTAL", "DENTIST", "ONE MEDICAL", "ZOCDOC",
    "PELOTON", "CLASSPASS", "EQUINOX", "LIFE TIME", "LIFETIME",
  ],
  Subscriptions: [
    "SPOTIFY", "APPLE.COM/BILL", "APPLE.COM BILL", "OPENAI", "PERPLEXITY",
    "GYMPASS", "GOOGLE *", "NYTIMES", "NEW YORK TIMES", "WASHINGTONPOST",
    "SUBSTACK", "MEDIUM", "DROPBOX", "LINKEDIN PREMIUM",
  ],
  Income: [
    "DIRECT DEPOSIT", "PAYROLL", "ACH CREDIT", "SALARY",
  ],
  Transfers: [
    "ZELLE", "VENMO", "CASH APP", "TRANSFER TO", "TRANSFER FROM",
    "PAYMENT FROM CHK", "PAYMENT TO CHK", "ONLINE TRANSFER",
  ],
  "Fees & Interest": [
    "INTEREST CHARGE", "FOREIGN TRANSACTION", "LATE FEE", "OVERDRAFT",
    "ATM FEE", "SERVICE CHARGE", "MONTHLY FEE", "ANNUAL FEE",
  ],
};

// Renames of default categories over time — older installs get migrated
// transparently on the next GET /api/categories.
const CATEGORY_RENAMES: Array<{ from: string; to: string }> = [
  { from: "Rent / Mortgage", to: "Rent" },
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
      // Target already exists — move transactions/rules then drop the old row
      await prisma.$transaction([
        prisma.transaction.updateMany({
          where: { categoryId: fromCat.id },
          data: { categoryId: toCat.id },
        }),
        prisma.categoryRule.updateMany({
          where: { categoryId: fromCat.id },
          data: { categoryId: toCat.id },
        }),
        prisma.category.delete({ where: { id: fromCat.id } }),
      ]);
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
    await prisma.category.createMany({
      data: missing.map((c) => ({ ...c, userId, isDefault: true })),
    });
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
  if (ruleRows.length > 0) {
    await prisma.categoryRule.createMany({ data: ruleRows });
  }
}
