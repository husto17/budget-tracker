import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getHouseholdAccountIds, getHouseholdId } from "@/lib/household";

export async function GET(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const settledParam = searchParams.get("settled");

  const accountIds = await getHouseholdAccountIds(session.user.id);

  const reimbursements = await prisma.reimbursement.findMany({
    where: {
      originalTx: { accountId: { in: accountIds } },
      ...(settledParam === "false" ? { settled: false } : {}),
      ...(settledParam === "true" ? { settled: true } : {}),
    },
    include: {
      originalTx: {
        select: {
          id: true, date: true, description: true, merchant: true, amount: true,
          account: { select: { id: true, name: true } },
          category: { select: { name: true, color: true } },
        },
      },
      reimbursementTx: {
        select: { id: true, date: true, description: true, merchant: true, amount: true },
      },
    },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json(reimbursements);
}

export async function POST(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "Invalid body" }, { status: 400 });

  const { originalTxId, note, personName } = body as { originalTxId?: string; note?: string; personName?: string };
  if (!originalTxId) return NextResponse.json({ error: "originalTxId is required" }, { status: 400 });

  const amount = parseFloat(String(body.amount));
  if (!isFinite(amount) || amount <= 0) {
    return NextResponse.json({ error: "amount must be a positive number" }, { status: 400 });
  }

  const [householdId, householdAccountIds] = await Promise.all([
    getHouseholdId(session.user.id),
    getHouseholdAccountIds(session.user.id),
  ]);

  const original = await prisma.transaction.findUnique({
    where: { id: originalTxId },
    include: { reimbursementsReceived: { select: { amount: true } } },
  });
  if (!original || !householdAccountIds.includes(original.accountId)) {
    return NextResponse.json({ error: "Transaction not found" }, { status: 404 });
  }
  if (original.isCredit) {
    return NextResponse.json({ error: "Can only track owed amounts on expenses (debits)" }, { status: 400 });
  }

  const alreadyTracked = original.reimbursementsReceived.reduce((s, r) => s + r.amount, 0);
  if (alreadyTracked + amount > original.amount + 0.01) {
    return NextResponse.json({ error: "Amount exceeds the original transaction." }, { status: 400 });
  }

  const created = await prisma.reimbursement.create({
    data: {
      userId: session.user.id,
      householdId: householdId ?? null,
      originalTxId,
      amount,
      personName: personName || null,
      note: note || null,
    },
  });

  return NextResponse.json(created);
}
