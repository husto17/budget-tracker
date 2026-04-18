import { prisma } from "./prisma";

export const DEFAULT_CATEGORIES = [
  { name: "Groceries", color: "#22C55E", icon: "shopping-cart" },
  { name: "Dining Out", color: "#F97316", icon: "utensils" },
  { name: "Transport", color: "#3B82F6", icon: "car" },
  { name: "Utilities", color: "#8B5CF6", icon: "zap" },
  { name: "Rent / Mortgage", color: "#EF4444", icon: "home" },
  { name: "Entertainment", color: "#EC4899", icon: "tv" },
  { name: "Shopping", color: "#F59E0B", icon: "shopping-bag" },
  { name: "Health", color: "#10B981", icon: "heart" },
  { name: "Subscriptions", color: "#6366F1", icon: "repeat" },
  { name: "Income", color: "#14B8A6", icon: "trending-up" },
  { name: "Transfers", color: "#6B7280", icon: "arrow-right-left" },
  { name: "Fees & Interest", color: "#DC2626", icon: "percent" },
  { name: "Other", color: "#9CA3AF", icon: "circle" },
];

// Creates any default categories the user is missing. Safe to call repeatedly —
// e.g. on every GET /api/categories — so existing users pick up newly-added
// defaults without a migration.
export async function ensureDefaultCategories(userId: string): Promise<void> {
  const existing = await prisma.category.findMany({
    where: { userId, name: { in: DEFAULT_CATEGORIES.map((c) => c.name) } },
    select: { name: true },
  });
  const have = new Set(existing.map((c) => c.name));
  const missing = DEFAULT_CATEGORIES.filter((c) => !have.has(c.name));
  if (missing.length === 0) return;
  await prisma.category.createMany({
    data: missing.map((c) => ({ ...c, userId, isDefault: true })),
  });
}
