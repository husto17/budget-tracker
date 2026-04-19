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

  if (typeof pattern !== "string" || pattern.trim().length === 0) {
    return NextResponse.json({ error: "Pattern required" }, { status: 400 });
  }
  if (isRegex) {
    try {
      new RegExp(pattern, "i");
    } catch {
      return NextResponse.json({ error: "Invalid regex pattern" }, { status: 400 });
    }
  }

  const rule = await prisma.categoryRule.create({
    data: {
      userId: session.user.id,
      categoryId: id,
      pattern: pattern.trim(),
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

  const { id: categoryId } = await params;

  // Accept ruleId from query param (preferred) or JSON body (legacy).
  const { searchParams } = new URL(request.url);
  let ruleId = searchParams.get("ruleId");
  if (!ruleId) {
    try {
      const body = await request.json();
      ruleId = body.ruleId ?? null;
    } catch {
      // body missing or not JSON — ruleId stays null
    }
  }

  if (!ruleId) {
    return NextResponse.json({ error: "ruleId required" }, { status: 400 });
  }

  // Verify rule belongs to this user's category.
  const rule = await prisma.categoryRule.findFirst({
    where: { id: ruleId, categoryId, userId: session.user.id },
  });
  if (!rule) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  await prisma.categoryRule.delete({ where: { id: ruleId } });

  return NextResponse.json({ success: true });
}
