import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getHouseholdAccountIds } from "@/lib/household";
import { autoCategorize, normalizeMerchant } from "@/lib/auto-categorize";
import crypto from "crypto";

interface IncomingTransaction {
  date: string;
  description: string;
  amount: number;
  isCredit: boolean;
  isPending: boolean;
}

export async function POST(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json() as { accountId: string; transactions: IncomingTransaction[] };
  const { accountId, transactions } = body;

  if (!accountId || !Array.isArray(transactions)) {
    return NextResponse.json({ error: "accountId and transactions are required" }, { status: 400 });
  }

  // Verify account belongs to household
  const householdAccountIds = await getHouseholdAccountIds(session.user.id);
  const account = await prisma.account.findUnique({ where: { id: accountId } });
  if (!account || !householdAccountIds.includes(account.id)) {
    return NextResponse.json({ error: "Account not found" }, { status: 404 });
  }

  let saved = 0;
  let skipped = 0;

  for (const tx of transactions) {
    const dateStr = tx.date ?? new Date().toISOString().slice(0, 10);
    const hash = crypto
      .createHash("sha256")
      .update(`${dateStr}|${tx.description}|${tx.amount}`)
      .digest("hex")
      .slice(0, 16);

    // Check for duplicate
    const existing = await prisma.transaction.findUnique({
      where: { accountId_hash: { accountId, hash } },
    });
    if (existing) {
      skipped++;
      continue;
    }

    const merchant = normalizeMerchant(tx.description);
    const categoryId = await autoCategorize(session.user.id, tx.description);

    await prisma.transaction.create({
      data: {
        accountId,
        date: new Date(dateStr),
        description: tx.description,
        originalDescription: tx.description,
        amount: tx.amount,
        isCredit: tx.isCredit,
        isPending: tx.isPending,
        isReconciled: false,
        source: "screenshot",
        hash,
        merchant,
        categoryId,
      },
    });

    saved++;
  }

  return NextResponse.json({ saved, skipped });
}
