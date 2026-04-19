import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { PALETTE } from "@/lib/palette";
import { getHouseholdAccountIds } from "@/lib/household";

// Replaces goal.currentAmount with the linked account's computed balance when
// linkedAccountId is set. Shared between GET and POST so both return the
// effective progress.
async function applyLinkedBalances<T extends { id: string; linkedAccountId: string | null; currentAmount: number }>(
  goals: T[],
): Promise<T[]> {
  const linkedIds = goals.map((g) => g.linkedAccountId).filter((x): x is string => !!x);
  if (linkedIds.length === 0) return goals;
  const grouped = await prisma.transaction.groupBy({
    by: ["accountId", "isCredit"],
    where: { accountId: { in: linkedIds }, deletedAt: null, isExcluded: false },
    _sum: { amount: true },
  });
  const balances = new Map<string, number>();
  for (const row of grouped) {
    const prev = balances.get(row.accountId) ?? 0;
    const delta = row.isCredit ? (row._sum.amount ?? 0) : -(row._sum.amount ?? 0);
    balances.set(row.accountId, prev + delta);
  }
  const anchors = await prisma.account.findMany({
    where: { id: { in: linkedIds } },
    select: { id: true, openingBalance: true, type: true },
  });
  for (const a of anchors) {
    const rolled = balances.get(a.id) ?? 0;
    const anchored = a.openingBalance != null ? rolled + a.openingBalance : rolled;
    // For a credit card, progress would be "debt reduction" — flip sign.
    balances.set(a.id, a.type === "CREDIT_CARD" ? -anchored : anchored);
  }
  return goals.map((g) =>
    g.linkedAccountId
      ? { ...g, currentAmount: Math.max(balances.get(g.linkedAccountId) ?? 0, 0) }
      : g,
  );
}

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
  const withBalances = await applyLinkedBalances(goals);
  return NextResponse.json(withBalances);
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

  // Validate linkedAccountId against the user's household-visible accounts.
  let linkedAccountId: string | null = null;
  if (typeof body.linkedAccountId === "string" && body.linkedAccountId.trim()) {
    const householdIds = await getHouseholdAccountIds(session.user.id);
    if (householdIds.includes(body.linkedAccountId)) {
      linkedAccountId = body.linkedAccountId;
    }
  }

  const goal = await prisma.goal.create({
    data: {
      userId: session.user.id,
      name: body.name.trim(),
      targetAmount: target,
      currentAmount: current,
      targetDate,
      color,
      icon: typeof body.icon === "string" ? body.icon : null,
      linkedAccountId,
    },
  });
  return NextResponse.json(goal);
}
