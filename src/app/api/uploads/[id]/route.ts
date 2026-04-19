import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getHouseholdAccountIds } from "@/lib/household";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const householdAccountIds = await getHouseholdAccountIds(session.user.id);

  const upload = await prisma.upload.findUnique({
    where: { id },
    include: {
      transactions: {
        orderBy: { date: "asc" },
        select: {
          id: true,
          date: true,
          description: true,
          merchant: true,
          amount: true,
          isCredit: true,
          isPending: true,
          category: { select: { name: true, color: true } },
        },
      },
    },
  });

  if (!upload || !householdAccountIds.includes(upload.accountId)) {
    return NextResponse.json({ error: "Upload not found" }, { status: 404 });
  }

  const account = await prisma.account.findUnique({
    where: { id: upload.accountId },
    select: { id: true, name: true, type: true, institution: true },
  });

  // Compute the delta implied by the statement (closing − opening) and the
  // sum of parsed transactions, to surface parse-coverage issues.
  let txSumCredits = 0;
  let txSumDebits = 0;
  for (const t of upload.transactions) {
    if (t.isCredit) txSumCredits += t.amount;
    else txSumDebits += t.amount;
  }
  const parsedDelta = txSumCredits - txSumDebits;
  const statementDelta =
    upload.closingBalance != null && upload.openingBalance != null
      ? upload.closingBalance - upload.openingBalance
      : null;
  const parseDiff = statementDelta != null ? parsedDelta - statementDelta : null;

  return NextResponse.json({
    ...upload,
    account,
    parsedDelta,
    statementDelta,
    parseDiff,
    txCounts: { credits: upload.transactions.filter((t) => t.isCredit).length, debits: upload.transactions.filter((t) => !t.isCredit).length },
  });
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;

  const householdAccountIds = await getHouseholdAccountIds(session.user.id);

  const upload = await prisma.upload.findUnique({
    where: { id },
    select: { id: true, accountId: true },
  });

  if (!upload || !householdAccountIds.includes(upload.accountId)) {
    return NextResponse.json({ error: "Upload not found" }, { status: 404 });
  }

  // Delete transactions linked to this upload (orphaned ones too)
  await prisma.transaction.deleteMany({ where: { uploadId: id } });

  // Delete the upload record
  await prisma.upload.delete({ where: { id } });

  return NextResponse.json({ success: true });
}
