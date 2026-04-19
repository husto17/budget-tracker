import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { ensureDefaultCategories } from "@/lib/default-categories";
import { getPartnerUserId } from "@/lib/household";
import { PALETTE } from "@/lib/palette";

async function pickLeastUsedColor(userId: string): Promise<string> {
  const existing = await prisma.category.findMany({
    where: { userId },
    select: { color: true },
  });
  const counts = new Map<string, number>();
  for (const c of PALETTE) counts.set(c.toUpperCase(), 0);
  for (const cat of existing) {
    const key = cat.color.toUpperCase();
    if (counts.has(key)) counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  let best = PALETTE[0];
  let bestCount = Infinity;
  for (const c of PALETTE) {
    const n = counts.get(c.toUpperCase()) ?? 0;
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

  // Backfill/rename default categories for both the current user and their
  // partner — so renames like Transportation→Transport apply to all household
  // members, keeping category names in sync across joint accounts.
  const partnerUserId = await getPartnerUserId(session.user.id);
  await ensureDefaultCategories(session.user.id);
  if (partnerUserId) {
    try { await ensureDefaultCategories(partnerUserId); } catch (e) {
      console.error("Failed to sync partner default categories", e);
    }
  }

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
