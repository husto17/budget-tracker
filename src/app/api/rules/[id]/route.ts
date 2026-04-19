import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getHouseholdId } from "@/lib/household";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const householdId = await getHouseholdId(session.user.id);

  const rule = await prisma.categoryRule.findFirst({
    where: householdId ? { id, householdId } : { id, userId: session.user.id },
  });
  if (!rule) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const { pattern, categoryId, isRegex, priority } = await request.json();
  const updated = await prisma.categoryRule.update({
    where: { id },
    data: {
      pattern: pattern !== undefined ? String(pattern).trim() : undefined,
      categoryId: categoryId !== undefined ? categoryId : undefined,
      isRegex: isRegex !== undefined ? Boolean(isRegex) : undefined,
      priority: priority !== undefined ? Number(priority) : undefined,
    },
    include: { category: { select: { id: true, name: true, color: true } } },
  });
  return NextResponse.json(updated);
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const householdId = await getHouseholdId(session.user.id);

  const rule = await prisma.categoryRule.findFirst({
    where: householdId ? { id, householdId } : { id, userId: session.user.id },
  });
  if (!rule) return NextResponse.json({ error: "Not found" }, { status: 404 });

  await prisma.categoryRule.delete({ where: { id } });
  return NextResponse.json({ success: true });
}
