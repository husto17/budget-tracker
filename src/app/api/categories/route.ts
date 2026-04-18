import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { ensureDefaultCategories } from "@/lib/default-categories";

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

  const category = await prisma.category.create({
    data: {
      userId: session.user.id,
      name,
      color: color ?? "#6B7280",
      icon,
      monthlyBudget: budgetValue,
    },
  });

  return NextResponse.json(category);
}
