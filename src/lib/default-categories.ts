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
  { name: "Income", color: "#0F766E", icon: "trending-up" },
  { name: "Savings", color: "#06B6D4", icon: "piggy-bank" },
  { name: "Taxes", color: "#334155", icon: "landmark" },
  { name: "Transfers", color: "#64748B", icon: "arrow-right-left" },
  { name: "Fees & Interest", color: "#B91C1C", icon: "percent" },
  { name: "Other", color: "#9CA3AF", icon: "circle" },
];

// Starter auto-categorize rules seeded alongside the default categories.
// These match against the raw transaction description (case-insensitive substring).
// Intentionally small — ~6–10 obvious patterns per category. Every manual
// category assignment also creates a rule, so the list grows naturally per
// user rather than shipping with a wall of defaults.
export const DEFAULT_RULES: Record<string, string[]> = {
  Groceries: [
    "TRADER JOE", "WHOLE FOODS", "WHOLEFDS", "ALDI", "KROGER", "SAFEWAY",
    "JEWEL OSCO", "INSTACART", "COSTCO", "WALMART GROCERY",
  ],
  "Dining Out": [
    "STARBUCKS", "CHIPOTLE", "DOORDASH", "GRUBHUB", "SEAMLESS",
    "UBER EATS", "UBEREATS", "PIZZERIA", "RESTAURANT", "COFFEE", "CAFE",
  ],
  Transport: [
    "UBER *TRIP", "UBER* TRIP", "LYFT", "CURB", "PARKING", "TOLL", "METRA", "CTA",
    "EXXON", "BP", "SUNOCO", "SHELL", "CHEVRON", "MOBIL",
  ],
  Travel: [
    "AIRLINES", "AIR CANADA", "BRITISH AIR", "DELTA AIR", "UNITED AIR",
    "AMERICAN AIR", "JETBLUE", "SOUTHWEST", "SPIRIT AIR", "AMTRAK",
    "MARRIOTT", "HILTON", "HYATT", "AIRBNB", "BOOKING.COM", "EXPEDIA",
    "HOTELS.COM", "HERTZ", "ENTERPRISE RENT", "AVIS",
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
    "BEST BUY", "ETSY", "EBAY", "USPS", "FEDEX", "UPS ",
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
    "GOOGLE ONE", "ICLOUD", "AMAZON PRIME", "PRIME VIDEO",
    "DISNEY PLUS", "DISNEY+", "HBO MAX", "PEACOCK", "PARAMOUNT",
    "YOUTUBE PREMIUM",
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

// Renames of default categories over time — kept for reference / documentation.
// The rename sweep is no longer applied at runtime; clean data reset handles it.
export const CATEGORY_RENAMES: Array<{ from: string; to: string }> = [
  { from: "Rent / Mortgage", to: "Rent" },
  { from: "Transportation", to: "Transport" },
  { from: "Grocery", to: "Groceries" },
  { from: "Grocery & Dining", to: "Groceries" },
];

// Creates any default categories the household is missing, and seeds starter
// rules for newly-created categories. Safe to call repeatedly — e.g. on every
// GET /api/categories — so existing users pick up newly-added defaults without
// a migration.
//
// When the user belongs to a household, categories are owned by the household
// (householdId set). The userId is always stored for audit / solo fallback.
export async function ensureDefaultCategories(userId: string): Promise<void> {
  // Look up the household so we can scope categories to it.
  const userRecord = await prisma.user.findUnique({
    where: { id: userId },
    select: { householdId: true },
  });
  const householdId = userRecord?.householdId ?? null;

  // Build the "where" clause for querying existing categories.
  const categoryWhere = householdId
    ? { householdId }
    : { userId };

  const existing = await prisma.category.findMany({
    where: { ...categoryWhere, name: { in: DEFAULT_CATEGORIES.map((c) => c.name) } },
    select: { id: true, name: true, color: true, icon: true, isDefault: true },
  });
  const have = new Set(existing.map((c) => c.name));
  const missing = DEFAULT_CATEGORIES.filter((c) => !have.has(c.name));

  // Sync colors + icons on isDefault categories so palette updates reach
  // existing users. Only touches isDefault:true rows to preserve custom ones.
  for (const cat of existing) {
    if (!cat.isDefault) continue;
    const target = DEFAULT_CATEGORIES.find((d) => d.name === cat.name);
    if (!target) continue;
    if (cat.color !== target.color || cat.icon !== target.icon) {
      await prisma.category.update({
        where: { id: cat.id },
        data: { color: target.color, icon: target.icon },
      });
    }
  }

  let newCategories: Array<{ id: string; name: string }> = existing.map((c) => ({ id: c.id, name: c.name }));
  if (missing.length > 0) {
    // Sequential .create() avoids the "transactions not supported in HTTP mode"
    // error that Prisma's createMany triggers against the Neon HTTP adapter.
    for (const c of missing) {
      await prisma.category.create({
        data: {
          ...c,
          userId,
          ...(householdId ? { householdId } : {}),
          isDefault: true,
        },
      });
    }
    newCategories = await prisma.category.findMany({
      where: { ...categoryWhere, name: { in: DEFAULT_CATEGORIES.map((c) => c.name) } },
      select: { id: true, name: true },
    });
  }

  // Build the "where" clause for querying existing rules.
  const ruleWhere = householdId
    ? { householdId, categoryId: { in: newCategories.map((c) => c.id) } }
    : { userId, categoryId: { in: newCategories.map((c) => c.id) } };

  // Seed starter rules for any default category that has no rules yet.
  const existingRules = await prisma.categoryRule.findMany({
    where: ruleWhere,
    select: { categoryId: true, pattern: true },
  });
  const rulesByCategory = new Map<string, Set<string>>();
  for (const r of existingRules) {
    if (!rulesByCategory.has(r.categoryId)) rulesByCategory.set(r.categoryId, new Set());
    rulesByCategory.get(r.categoryId)!.add(r.pattern.toUpperCase());
  }

  for (const cat of newCategories) {
    const patterns = DEFAULT_RULES[cat.name];
    if (!patterns) continue;
    const already = rulesByCategory.get(cat.id) ?? new Set();
    for (const p of patterns) {
      if (!already.has(p.toUpperCase())) {
        await prisma.categoryRule.create({
          data: {
            userId,
            categoryId: cat.id,
            pattern: p,
            ...(householdId ? { householdId } : {}),
          },
        });
      }
    }
  }
}
