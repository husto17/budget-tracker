import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const { pattern, isRegex } = await request.json();

  const category = await prisma.category.findUnique({ where: { id } });
  if (!category || category.userId !== session.user.id) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const rule = await prisma.categoryRule.create({
    data: {
      userId: session.user.id,
      categoryId: id,
      pattern,
      isRegex: isRegex ?? false,
    },
  });

  return NextResponse.json(rule);
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id: _categoryId } = await params;
  const { ruleId } = await request.json();

  const rule = await prisma.categoryRule.findUnique({ where: { id: ruleId } });
  if (!rule || rule.userId !== session.user.id) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  await prisma.categoryRule.delete({ where: { id: ruleId } });

  return NextResponse.json({ success: true });
}
