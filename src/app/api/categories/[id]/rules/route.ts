import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getHouseholdId } from "@/lib/household";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const { pattern, isRegex } = await request.json();

  const householdId = await getHouseholdId(session.user.id);
  const category = await prisma.category.findUnique({ where: { id } });
  const accessible = category && (
    (householdId && category.householdId === householdId) ||
    category.userId === session.user.id
  );
  if (!accessible) {
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

  const trimmed = pattern.trim();

  // Check for existing rule by householdId if available, else by userId.
  const ruleWhere = householdId
    ? { householdId, categoryId: id, pattern: { equals: trimmed, mode: "insensitive" as const }, isRegex: isRegex ?? false }
    : { userId: session.user.id, categoryId: id, pattern: { equals: trimmed, mode: "insensitive" as const }, isRegex: isRegex ?? false };

  const existing = await prisma.categoryRule.findFirst({ where: ruleWhere });
  if (existing) return NextResponse.json(existing);

  const rule = await prisma.categoryRule.create({
    data: {
      userId: session.user.id,
      categoryId: id,
      pattern: trimmed,
      isRegex: isRegex ?? false,
      ...(householdId ? { householdId } : {}),
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

  const householdId = await getHouseholdId(session.user.id);
  // Verify rule belongs to this household's category.
  const ruleWhere = householdId
    ? { id: ruleId, categoryId, householdId }
    : { id: ruleId, categoryId, userId: session.user.id };

  const rule = await prisma.categoryRule.findFirst({ where: ruleWhere });
  if (!rule) {
    // Fall back to userId check in case rule predates householdId migration.
    const fallback = await prisma.categoryRule.findFirst({
      where: { id: ruleId, categoryId, userId: session.user.id },
    });
    if (!fallback) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
  }

  await prisma.categoryRule.delete({ where: { id: ruleId } });

  return NextResponse.json({ success: true });
}
