import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getHouseholdAccountIds, getHouseholdId } from "@/lib/household";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const householdId = await getHouseholdId(session.user.id);

  const goal = await prisma.goal.findFirst({
    where: householdId ? { id, householdId } : { id, userId: session.user.id },
  });
  if (!goal) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const body = await request.json().catch(() => ({}));
  const data: {
    name?: string;
    targetAmount?: number;
    currentAmount?: number;
    targetDate?: Date | null;
    color?: string;
    icon?: string | null;
    linkedAccountId?: string | null;
  } = {};

  if (typeof body.name === "string" && body.name.trim()) data.name = body.name.trim();
  if (body.targetAmount != null) {
    const t = parseFloat(String(body.targetAmount));
    if (!isFinite(t) || t <= 0) return NextResponse.json({ error: "Target amount invalid" }, { status: 400 });
    data.targetAmount = t;
  }
  if (body.currentAmount != null) {
    const c = parseFloat(String(body.currentAmount));
    if (!isFinite(c) || c < 0) return NextResponse.json({ error: "Current amount invalid" }, { status: 400 });
    data.currentAmount = c;
  }
  if (body.targetDate === null) {
    data.targetDate = null;
  } else if (typeof body.targetDate === "string" && body.targetDate) {
    const d = new Date(body.targetDate);
    if (isNaN(d.getTime())) return NextResponse.json({ error: "Invalid target date" }, { status: 400 });
    data.targetDate = d;
  }
  if (typeof body.color === "string") data.color = body.color;
  if (body.icon !== undefined) data.icon = body.icon;
  if (body.linkedAccountId !== undefined) {
    if (body.linkedAccountId === null || body.linkedAccountId === "") {
      data.linkedAccountId = null;
    } else if (typeof body.linkedAccountId === "string") {
      const householdAccountIds = await getHouseholdAccountIds(session.user.id);
      data.linkedAccountId = householdAccountIds.includes(body.linkedAccountId) ? body.linkedAccountId : null;
    }
  }

  const updated = await prisma.goal.update({ where: { id }, data });
  return NextResponse.json(updated);
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const householdId = await getHouseholdId(session.user.id);

  const goal = await prisma.goal.findFirst({
    where: householdId ? { id, householdId } : { id, userId: session.user.id },
  });
  if (!goal) return NextResponse.json({ error: "Not found" }, { status: 404 });

  await prisma.goal.delete({ where: { id } });
  return NextResponse.json({ success: true });
}
