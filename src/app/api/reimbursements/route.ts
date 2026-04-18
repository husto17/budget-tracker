import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getHouseholdAccountIds } from "@/lib/household";

// POST /api/reimbursements — link a credit tx to a debit tx that partially
// offsets it. Body: { originalTxId, reimbursementTxId, amount, note? }.
//
// Validates:
// - both txs belong to the user's household
// - originalTx is a debit, reimbursementTx is a credit
// - amount > 0 and <= reimbursementTx's remaining unlinked amount
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
    prisma.transaction.findUnique({
      where: { id: originalTxId },
      include: {
        reimbursementsReceived: true,
      },
    }),
    prisma.transaction.findUnique({
      where: { id: reimbursementTxId },
      include: {
        reimbursementsApplied: true,
      },
    }),
  ]);

  if (!original || !householdAccountIds.includes(original.accountId)) {
    return NextResponse.json({ error: "Original transaction not found" }, { status: 404 });
  }
  if (!reimbursement || !householdAccountIds.includes(reimbursement.accountId)) {
    return NextResponse.json({ error: "Reimbursement transaction not found" }, { status: 404 });
  }
  if (original.isCredit) {
    return NextResponse.json(
      { error: "originalTxId must be a debit (money out) — you can't reimburse a credit" },
      { status: 400 },
    );
  }
  if (!reimbursement.isCredit) {
    return NextResponse.json(
      { error: "reimbursementTxId must be a credit (money in)" },
      { status: 400 },
    );
  }

  // Don't double-apply more than the credit tx's amount
  const alreadyApplied = reimbursement.reimbursementsApplied.reduce(
    (s, r) => s + r.amount,
    0,
  );
  if (alreadyApplied + amount > reimbursement.amount + 0.01) {
    return NextResponse.json(
      {
        error: `Only ${(reimbursement.amount - alreadyApplied).toFixed(2)} of this credit is still unapplied.`,
      },
      { status: 400 },
    );
  }

  // Don't over-reimburse the original either
  const alreadyReceived = original.reimbursementsReceived.reduce(
    (s, r) => s + r.amount,
    0,
  );
  if (alreadyReceived + amount > original.amount + 0.01) {
    return NextResponse.json(
      {
        error: `Original is already offset by ${alreadyReceived.toFixed(2)} — can't exceed the original amount.`,
      },
      { status: 400 },
    );
  }

  const created = await prisma.reimbursement.create({
    data: {
      userId: session.user.id,
      originalTxId,
      reimbursementTxId,
      amount,
      note: note || null,
    },
  });

  return NextResponse.json(created);
}
