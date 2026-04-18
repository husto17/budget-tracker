import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { PALETTE } from "@/lib/palette";

async function pickLeastUsedColor(userId: string): Promise<string> {
  const existing = await prisma.goal.findMany({
    where: { userId },
    select: { color: true },
  });
  const counts = new Map<string, number>();
  for (const c of PALETTE) counts.set(c.toUpperCase(), 0);
  for (const g of existing) {
    const key = g.color.toUpperCase();
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

  const goals = await prisma.goal.findMany({
    where: { userId: session.user.id },
    orderBy: { createdAt: "asc" },
  });
  return NextResponse.json(goals);
}

export async function POST(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json().catch(() => null);
  if (!body || typeof body.name !== "string" || !body.name.trim()) {
    return NextResponse.json({ error: "Name required" }, { status: 400 });
  }
  const target = parseFloat(String(body.targetAmount));
  if (!isFinite(target) || target <= 0) {
    return NextResponse.json({ error: "Target amount must be positive" }, { status: 400 });
  }
  const current = body.currentAmount != null ? parseFloat(String(body.currentAmount)) : 0;
  if (!isFinite(current) || current < 0) {
    return NextResponse.json({ error: "Current amount invalid" }, { status: 400 });
  }
  let targetDate: Date | null = null;
  if (body.targetDate) {
    const d = new Date(String(body.targetDate));
    if (isNaN(d.getTime())) {
      return NextResponse.json({ error: "Invalid target date" }, { status: 400 });
    }
    targetDate = d;
  }

  const color =
    typeof body.color === "string" && body.color.trim()
      ? body.color
      : await pickLeastUsedColor(session.user.id);

  const goal = await prisma.goal.create({
    data: {
      userId: session.user.id,
      name: body.name.trim(),
      targetAmount: target,
      currentAmount: current,
      targetDate,
      color,
      icon: typeof body.icon === "string" ? body.icon : null,
    },
  });
  return NextResponse.json(goal);
}
