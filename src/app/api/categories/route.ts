import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { ensureDefaultCategories } from "@/lib/default-categories";

// Perceptually-spaced palette — matches CHART_COLORS on the dashboard.
const CATEGORY_PALETTE = [
  "#EF4444", "#F97316", "#EAB308", "#84CC16", "#10B981",
  "#06B6D4", "#3B82F6", "#8B5CF6", "#EC4899", "#64748B",
  "#A855F7", "#1F2937",
];

async function pickLeastUsedColor(userId: string): Promise<string> {
  const existing = await prisma.category.findMany({
    where: { userId },
    select: { color: true },
  });
  const counts = new Map<string, number>();
  for (const c of CATEGORY_PALETTE) counts.set(c, 0);
  for (const cat of existing) {
    const key = cat.color.toUpperCase();
    if (counts.has(key)) counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  let best = CATEGORY_PALETTE[0];
  let bestCount = Infinity;
  for (const c of CATEGORY_PALETTE) {
    const n = counts.get(c) ?? 0;
    if (n < bestCount) {
      bestCount = n;
      best = c;
    }
  }
  return best;
}

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Backfill any default categories the user is missing (e.g. when we add
  // a new default after they registered). No-op when already present.
  await ensureDefaultCategories(session.user.id);

  const categories = await prisma.category.findMany({
    where: { userId: session.user.id },
    include: {
      rules: true,
      _count: { select: { transactions: true } },
    },
    orderBy: { name: "asc" },
  });

  return NextResponse.json(categories);
}

export async function POST(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { name, color, icon, monthlyBudget } = await request.json();

  if (!name) {
    return NextResponse.json({ error: "Name is required" }, { status: 400 });
  }

  let budgetValue: number | null = null;
  if (monthlyBudget != null && monthlyBudget !== "") {
    const parsed = parseFloat(String(monthlyBudget));
    if (!isFinite(parsed) || parsed < 0) {
      return NextResponse.json({ error: "Invalid monthly budget" }, { status: 400 });
    }
    budgetValue = parsed;
  }

  // Auto-pick the least-used palette colour when one isn't provided, so new
  // categories land on visually distinct colours without the user picking.
  const finalColor = (typeof color === "string" && color.trim()) || (await pickLeastUsedColor(session.user.id));

  const category = await prisma.category.create({
    data: {
      userId: session.user.id,
      name,
      color: finalColor,
      icon,
      monthlyBudget: budgetValue,
    },
  });

  return NextResponse.json(category);
}
