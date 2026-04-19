import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { ensureDefaultCategories, CATEGORY_RENAMES } from "@/lib/default-categories";
import { getHouseholdCategoryOwnerId, mergeHouseholdCategories, getPartnerUserId } from "@/lib/household";
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

  // Merge any partner categories into the canonical owner first, then seed
  // defaults for the owner only. This keeps both household members in sync.
  const [ownerId, partnerUserId] = await Promise.all([
    getHouseholdCategoryOwnerId(session.user.id),
    getPartnerUserId(session.user.id),
  ]);
  try { await mergeHouseholdCategories(session.user.id); } catch (e) {
    console.error("Failed to merge household categories", e);
  }
  try { await ensureDefaultCategories(ownerId); } catch (e) {
    console.error("Failed to sync default categories", e);
  }
  // Force-apply category renames (e.g. Transportation→Transport) for every
  // household user on every categories load — no-op once data is clean.
  const allUserIds = partnerUserId ? [session.user.id, partnerUserId] : [session.user.id];
  for (const rename of CATEGORY_RENAMES) {
    for (const uid of allUserIds) {
      try {
        const fromCat = await prisma.category.findFirst({ where: { userId: uid, name: rename.from }, select: { id: true } });
        if (!fromCat) continue;
        const toCat = await prisma.category.findFirst({ where: { userId: uid, name: rename.to }, select: { id: true } });
        if (toCat) {
          await prisma.transaction.updateMany({ where: { categoryId: fromCat.id }, data: { categoryId: toCat.id } });
          await prisma.categoryRule.updateMany({ where: { categoryId: fromCat.id }, data: { categoryId: toCat.id } });
          await prisma.category.delete({ where: { id: fromCat.id } });
        } else {
          await prisma.category.update({ where: { id: fromCat.id }, data: { name: rename.to } });
        }
      } catch (e) {
        console.error(`Rename ${rename.from}→${rename.to} failed for ${uid}`, e);
      }
    }
  }

  const categories = await prisma.category.findMany({
    where: { userId: ownerId },
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

  const ownerId = await getHouseholdCategoryOwnerId(session.user.id);
  // Auto-pick the least-used palette colour when one isn't provided, so new
  // categories land on visually distinct colours without the user picking.
  const finalColor = (typeof color === "string" && color.trim()) || (await pickLeastUsedColor(ownerId));

  const category = await prisma.category.create({
    data: {
      userId: ownerId,
      name,
      color: finalColor,
      icon,
      monthlyBudget: budgetValue,
    },
  });

  return NextResponse.json(category);
}
