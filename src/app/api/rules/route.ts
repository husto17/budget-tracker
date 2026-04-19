import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const rules = await prisma.categoryRule.findMany({
    where: { userId: session.user.id },
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

  // Verify the category belongs to this user
  const category = await prisma.category.findFirst({
    where: { id: categoryId, userId: session.user.id },
  });
  if (!category) return NextResponse.json({ error: "Category not found" }, { status: 404 });

  const rule = await prisma.categoryRule.create({
    data: {
      userId: session.user.id,
      categoryId,
      pattern: pattern.trim(),
      isRegex: isRegex ?? false,
      priority: priority ?? 0,
    },
    include: { category: { select: { id: true, name: true, color: true } } },
  });
  return NextResponse.json(rule, { status: 201 });
}
