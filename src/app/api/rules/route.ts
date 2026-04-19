import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getHouseholdId } from "@/lib/household";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const householdId = await getHouseholdId(session.user.id);
  const where = householdId ? { householdId } : { userId: session.user.id };

  const rules = await prisma.categoryRule.findMany({
    where,
    include: { category: { select: { id: true, name: true, color: true } } },
    orderBy: [{ priority: "desc" }, { createdAt: "desc" }],
  });
  return NextResponse.json(rules);
}

export async function POST(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { pattern, categoryId, isRegex, priority } = await request.json();
  if (!pattern || !categoryId)
    return NextResponse.json({ error: "pattern and categoryId required" }, { status: 400 });

  const householdId = await getHouseholdId(session.user.id);
  const categoryWhere = householdId
    ? { id: categoryId, householdId }
    : { id: categoryId, userId: session.user.id };

  const category = await prisma.category.findFirst({ where: categoryWhere });
  if (!category) return NextResponse.json({ error: "Category not found" }, { status: 404 });

  const rule = await prisma.categoryRule.create({
    data: {
      userId: session.user.id,
      ...(householdId ? { householdId } : {}),
      categoryId,
      pattern: pattern.trim(),
      isRegex: isRegex ?? false,
      priority: priority ?? 0,
    },
    include: { category: { select: { id: true, name: true, color: true } } },
  });
  return NextResponse.json(rule, { status: 201 });
}
