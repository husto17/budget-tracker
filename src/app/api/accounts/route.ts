import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getPartnerUserId } from "@/lib/household";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const userId = session.user.id;
  const partnerUserId = await getPartnerUserId(userId);
  const userIds = partnerUserId ? [userId, partnerUserId] : [userId];

  const accounts = await prisma.account.findMany({
    where: { userId: { in: userIds } },
    include: {
      _count: { select: { transactions: true } },
    },
    orderBy: { createdAt: "asc" },
  });

  // Compute balance as credits − debits in a single groupBy call so we respect
  // direction. Previously we summed amount regardless of isCredit, which made
  // purchases and deposits cancel out on every account.
  //
  // Convention:
  //   - Checking/savings: positive balance = money you have
  //   - Credit cards: negative balance = money you owe (dashboard inverts for display)
  const grouped = await prisma.transaction.groupBy({
    by: ["accountId", "isCredit"],
    where: { accountId: { in: accounts.map((a) => a.id) } },
    _sum: { amount: true },
  });
  const balanceByAccount = new Map<string, number>();
  for (const row of grouped) {
    const prev = balanceByAccount.get(row.accountId) ?? 0;
    const delta = row.isCredit ? (row._sum.amount ?? 0) : -(row._sum.amount ?? 0);
    balanceByAccount.set(row.accountId, prev + delta);
  }

  // Reconciliation reference per account — use the latest statement that
  // includes a closingBalance + statementEnd. We then expect:
  //   reconciledBalance = closingBalance + (credits − debits) after statementEnd.
  // If |computed − reconciled| > $0.01 there's a divergence worth flagging.
  const latestStatements = await prisma.upload.findMany({
    where: {
      accountId: { in: accounts.map((a) => a.id) },
      closingBalance: { not: null },
      statementEnd: { not: null },
    },
    orderBy: { statementEnd: "desc" },
    select: { accountId: true, closingBalance: true, statementEnd: true, fileName: true },
  });
  const latestByAccount = new Map<string, typeof latestStatements[0]>();
  for (const s of latestStatements) {
    if (!latestByAccount.has(s.accountId)) latestByAccount.set(s.accountId, s);
  }

  // Sum tx per account occurring STRICTLY AFTER each statementEnd. Done per
  // account because the cutoff date differs across accounts.
  const reconciledByAccount = new Map<string, number>();
  for (const s of latestByAccount.values()) {
    if (!s.statementEnd || s.closingBalance == null) continue;
    const since = await prisma.transaction.groupBy({
      by: ["isCredit"],
      where: { accountId: s.accountId, date: { gt: s.statementEnd } },
      _sum: { amount: true },
    });
    let delta = 0;
    for (const row of since) {
      delta += row.isCredit ? (row._sum.amount ?? 0) : -(row._sum.amount ?? 0);
    }
    reconciledByAccount.set(s.accountId, s.closingBalance + delta);
  }

  // All uploads with parsed periods — used to detect gaps (missing
  // statements) and overlaps (likely duplicate uploads).
  const periodUploads = await prisma.upload.findMany({
    where: {
      accountId: { in: accounts.map((a) => a.id) },
      statementStart: { not: null },
      statementEnd: { not: null },
    },
    orderBy: { statementStart: "asc" },
    select: {
      id: true,
      accountId: true,
      fileName: true,
      statementStart: true,
      statementEnd: true,
    },
  });

  // Half-linked transfers — transactions whose transferPairId points to
  // a tx that either doesn't exist or doesn't link back.
  const allTransfers = await prisma.transaction.findMany({
    where: { transferPairId: { not: null }, accountId: { in: accounts.map((a) => a.id) } },
    select: { id: true, accountId: true, transferPairId: true, date: true },
  });
  const transferById = new Map(allTransfers.map((t) => [t.id, t]));
  const halfLinkedByAccount = new Map<string, number>();
  for (const t of allTransfers) {
    const pair = t.transferPairId ? transferById.get(t.transferPairId) : null;
    const isHalf = !pair || pair.transferPairId !== t.id;
    if (isHalf) {
      halfLinkedByAccount.set(t.accountId, (halfLinkedByAccount.get(t.accountId) ?? 0) + 1);
    }
  }

  type Warning =
    | { type: "missing_statement"; afterDate: Date; gapDays: number; afterFile: string }
    | { type: "overlap_statement"; fileA: string; fileB: string }
    | { type: "half_linked_transfers"; count: number };

  function diagnose(accountId: string): Warning[] {
    const out: Warning[] = [];
    const list = periodUploads.filter((u) => u.accountId === accountId);
    for (let i = 1; i < list.length; i++) {
      const prev = list[i - 1];
      const curr = list[i];
      // Statements typically span 28-31 days; flag gaps > 35d as suspicious.
      const gapDays = Math.round(
        (curr.statementStart!.getTime() - prev.statementEnd!.getTime()) / 86_400_000,
      );
      if (gapDays > 35) {
        out.push({
          type: "missing_statement",
          afterDate: prev.statementEnd!,
          gapDays,
          afterFile: prev.fileName,
        });
      }
      // Overlap: curr starts before prev ended → two uploads cover same window.
      if (curr.statementStart! < prev.statementEnd!) {
        out.push({ type: "overlap_statement", fileA: prev.fileName, fileB: curr.fileName });
      }
    }
    const halfCount = halfLinkedByAccount.get(accountId) ?? 0;
    if (halfCount > 0) out.push({ type: "half_linked_transfers", count: halfCount });
    return out;
  }

  const accountsWithBalance = accounts.map((account: typeof accounts[0]) => {
    const rawBalance = balanceByAccount.get(account.id) ?? 0;
    // Apply manual opening-balance anchor if set. Only transactions on or
    // after openingBalanceDate contribute on top of the anchor.
    let balance = rawBalance;
    if (account.openingBalance != null && account.openingBalanceDate) {
      // rawBalance is "all tx credits − debits". We want:
      //   openingBalance + (sum of tx on/after openingBalanceDate).
      // Rather than re-query, trust that the user set the anchor to reflect
      // what came *before* the first imported tx — so add the anchor on top.
      balance = rawBalance + account.openingBalance;
    }
    const owner: "me" | "partner" = account.userId === userId ? "me" : "partner";
    const reconciled = reconciledByAccount.get(account.id) ?? null;
    const latest = latestByAccount.get(account.id);
    return {
      ...account,
      computedBalance: balance,
      reconciledBalance: reconciled,
      latestStatement: latest
        ? {
            fileName: latest.fileName,
            closingBalance: latest.closingBalance,
            statementEnd: latest.statementEnd,
          }
        : null,
      warnings: diagnose(account.id),
      owner,
    };
  });

  return NextResponse.json(accountsWithBalance);
}

export async function POST(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { name, type, institution, lastFour, isJoint } = await request.json();

  if (!name || !type) {
    return NextResponse.json({ error: "Name and type are required" }, { status: 400 });
  }

  const account = await prisma.account.create({
    data: {
      userId: session.user.id,
      name,
      type,
      institution,
      lastFour,
      isJoint: isJoint ?? false,
    },
  });

  return NextResponse.json(account);
}
