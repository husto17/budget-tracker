import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getHouseholdAccountIds } from "@/lib/household";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const accountIds = await getHouseholdAccountIds(session.user.id);

  const reimbursements = await prisma.reimbursement.findMany({
    where: {
      originalTx: { accountId: { in: accountIds } },
    },
    include: {
      originalTx: {
        select: {
          id: true,
          date: true,
          description: true,
          merchant: true,
          amount: true,
          account: { select: { id: true, name: true } },
          category: { select: { name: true, color: true } },
        },
      },
      reimbursementTx: {
        select: {
          id: true,
          date: true,
          description: true,
          merchant: true,
          amount: true,
          account: { select: { id: true, name: true } },
        },
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
  const { originalTxId, reimbursementTxId, note } = body as {
    originalTxId?: string;
    reimbursementTxId?: string;
    amount?: number | string;
    note?: string;
  };
  if (!originalTxId || !reimbursementTxId) {
    return NextResponse.json({ error: "originalTxId and reimbursementTxId are required" }, { status: 400 });
  }
  const amount = parseFloat(String(body.amount));
  if (!isFinite(amount) || amount <= 0) {
    return NextResponse.json({ error: "amount must be a positive number" }, { status: 400 });
  }

  const householdAccountIds = await getHouseholdAccountIds(session.user.id);

  const [original, reimbursement] = await Promise.all([
    prisma.transaction.findUnique({ where: { id: originalTxId }, include: { reimbursementsReceived: true } }),
    prisma.transaction.findUnique({ where: { id: reimbursementTxId }, include: { reimbursementsApplied: true } }),
  ]);

  if (!original || !householdAccountIds.includes(original.accountId)) {
    return NextResponse.json({ error: "Original transaction not found" }, { status: 404 });
  }
  if (!reimbursement || !householdAccountIds.includes(reimbursement.accountId)) {
    return NextResponse.json({ error: "Reimbursement transaction not found" }, { status: 404 });
  }
  if (original.isCredit) {
    return NextResponse.json({ error: "originalTxId must be a debit" }, { status: 400 });
  }
  if (!reimbursement.isCredit) {
    return NextResponse.json({ error: "reimbursementTxId must be a credit" }, { status: 400 });
  }

  const alreadyApplied = reimbursement.reimbursementsApplied.reduce((s, r) => s + r.amount, 0);
  if (alreadyApplied + amount > reimbursement.amount + 0.01) {
    return NextResponse.json({ error: `Only ${(reimbursement.amount - alreadyApplied).toFixed(2)} still unapplied.` }, { status: 400 });
  }

  const alreadyReceived = original.reimbursementsReceived.reduce((s, r) => s + r.amount, 0);
  if (alreadyReceived + amount > original.amount + 0.01) {
    return NextResponse.json({ error: `Would exceed original amount.` }, { status: 400 });
  }

  const created = await prisma.reimbursement.create({
    data: { userId: session.user.id, originalTxId, reimbursementTxId, amount, note: note || null },
  });

  return NextResponse.json(created);
}
