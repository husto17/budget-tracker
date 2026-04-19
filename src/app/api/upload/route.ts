import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { parseCsv } from "@/lib/csv-parser";
import { parsePdfText } from "@/lib/pdf-parser";
import { autoCategorize, normalizeMerchant, detectTransferPair } from "@/lib/auto-categorize";
import { getHouseholdAccountIds } from "@/lib/household";

export async function POST(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const formData = await request.formData();
  const file = formData.get("file") as File;
  const accountId = formData.get("accountId") as string;

  if (!file || !accountId) {
    return NextResponse.json({ error: "File and accountId are required" }, { status: 400 });
  }

  // Verify account belongs to household (own or partner's)
  const householdAccountIds = await getHouseholdAccountIds(session.user.id);
  const account = await prisma.account.findUnique({ where: { id: accountId } });
  if (!account || !householdAccountIds.includes(account.id)) {
    return NextResponse.json({ error: "Account not found" }, { status: 404 });
  }

  const fileName = file.name;
  const fileType = fileName.endsWith(".pdf") ? "pdf" : "csv";
  const text = await file.text();

  let parseResult;
  if (fileType === "pdf") {
    // pdf-parse requires Buffer; for text extraction we use a server action workaround
    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const pdfParse = require("pdf-parse") as (buf: Buffer) => Promise<{ text: string }>;
    const pdfData = await pdfParse(buffer);
    parseResult = parsePdfText(pdfData.text);
  } else {
    parseResult = parseCsv(text);
  }

  if (parseResult.transactions.length === 0) {
    return NextResponse.json({
      error: "No transactions could be parsed",
      details: parseResult.errors,
      detectedBank: "detectedBank" in parseResult ? parseResult.detectedBank : null,
    }, { status: 422 });
  }

  // Create upload record. PDF parses may include statement-level context
  // (opening/closing balance + period dates); CSV parses never do — both fields
  // remain null there.
  const hasPdfMeta = fileType === "pdf" && "openingBalance" in parseResult;
  const upload = await prisma.upload.create({
    data: {
      userId: session.user.id,
      accountId,
      fileName,
      fileType,
      rowCount: parseResult.transactions.length,
      openingBalance: hasPdfMeta ? (parseResult as { openingBalance?: number }).openingBalance ?? null : null,
      closingBalance: hasPdfMeta ? (parseResult as { closingBalance?: number }).closingBalance ?? null : null,
      statementStart: hasPdfMeta ? (parseResult as { statementStart?: Date }).statementStart ?? null : null,
      statementEnd: hasPdfMeta ? (parseResult as { statementEnd?: Date }).statementEnd ?? null : null,
    },
  });

  function daysAround(date: Date, days: number): { gte: Date; lte: Date } {
    const before = new Date(date);
    before.setDate(before.getDate() - days);
    const after = new Date(date);
    after.setDate(after.getDate() + days);
    return { gte: before, lte: after };
  }

  // Score how well two descriptions match (0 = no match, >0 = match)
  function descriptionMatchScore(a: string, b: string, merchantA: string, merchantB: string): number {
    const mA = merchantA.toLowerCase().trim();
    const mB = merchantB.toLowerCase().trim();

    // Exact normalized merchant match — strongest signal
    if (mA && mB && mA === mB) return 3;

    // One merchant is contained within the other (handles "BP" vs "BP Gas Station")
    if (mA && mB && (mA.includes(mB) || mB.includes(mA))) return 2;

    // Word overlap — words ≥ 3 chars (covers "BP", "CVS", short names)
    const wordsA = new Set(a.toLowerCase().split(/\W+/).filter((w) => w.length >= 3));
    const wordsB = b.toLowerCase().split(/\W+/).filter((w) => w.length >= 3);
    const overlap = wordsB.filter((w) => wordsA.has(w)).length;
    return overlap;
  }

  // Days between two dates (absolute)
  function daysDiff(a: Date, b: Date): number {
    return Math.abs(a.getTime() - b.getTime()) / 86_400_000;
  }

  // Find the best-matching pending screenshot transaction for a statement transaction.
  //
  // Old approach: return first candidate that clears a threshold.
  // Problem: two Starbucks visits same week, same price → first-found wins regardless
  // of which is actually the right match.
  //
  // New approach: collect ALL qualifying candidates, score each one, return the best.
  // Score = (description quality × 10) − date distance in days
  // This prefers same-merchant + closest date over a weaker match that happens to appear first.
  //
  // isReconciled:false filter already prevents a pending tx from being claimed twice.
  async function findPendingMatch(txDate: Date, txAmount: number, txDesc: string, txMerchant: string) {
    type Scored = { candidate: typeof exactCandidates[0]; score: number };
    const ranked: Scored[] = [];

    // Pool 1: exact amount, ±7 days (loose description requirement: score ≥ 1)
    const exactCandidates = await prisma.transaction.findMany({
      where: {
        accountId: { in: householdAccountIds },
        isPending: true,
        isReconciled: false,
        amount: txAmount,
        date: daysAround(txDate, 7),
      },
    });
    for (const c of exactCandidates) {
      const desc = descriptionMatchScore(txDesc, c.description, txMerchant, c.merchant ?? "");
      if (desc >= 1) {
        ranked.push({ candidate: c, score: desc * 10 - daysDiff(txDate, c.date) });
      }
    }

    // Pool 2: amount ±25% (tips/pre-auths), ±3 days, stricter description (score ≥ 2)
    const lo = txAmount * 0.75;
    const hi = txAmount * 1.25;
    const flexCandidates = await prisma.transaction.findMany({
      where: {
        accountId: { in: householdAccountIds },
        isPending: true,
        isReconciled: false,
        amount: { gte: lo, lte: hi },
        date: daysAround(txDate, 3),
      },
    });
    for (const c of flexCandidates) {
      // Skip if already added from exact pool
      if (ranked.some((r) => r.candidate.id === c.id)) continue;
      const desc = descriptionMatchScore(txDesc, c.description, txMerchant, c.merchant ?? "");
      if (desc >= 2) {
        ranked.push({ candidate: c, score: desc * 10 - daysDiff(txDate, c.date) });
      }
    }

    if (ranked.length === 0) return null;

    // Return the highest-scoring candidate (best description match, closest date)
    ranked.sort((a, b) => b.score - a.score);
    return ranked[0].candidate;
  }

  let imported = 0;
  let skipped = 0;
  let reconciled = 0;
  const transferPairsLinked: Array<[string, string]> = [];

  for (const tx of parseResult.transactions) {
    // Check for exact duplicate (same account + hash)
    const existing = await prisma.transaction.findUnique({
      where: { accountId_hash: { accountId, hash: tx.hash } },
    });
    if (existing) {
      skipped++;
      continue;
    }

    const merchant = await normalizeMerchant(session.user.id, tx.description);
    const categoryId = await autoCategorize(session.user.id, tx.description);

    // Look for a matching pending screenshot transaction BEFORE creating a new record.
    // If found, we UPDATE the pending record to become the statement transaction
    // rather than creating a second record — this prevents double-counting.
    const pendingMatch = await findPendingMatch(tx.date, tx.amount, tx.description, merchant);

    let savedId: string;

    if (pendingMatch) {
      // Promote the pending transaction to a confirmed statement transaction.
      // Use statement data as authoritative (correct date, final amount, proper description).
      // Preserve the category the user may have already assigned.
      await prisma.transaction.update({
        where: { id: pendingMatch.id },
        data: {
          accountId,                          // ensure correct account
          date: tx.date,                      // statement date is authoritative
          description: tx.description,
          originalDescription: tx.description,
          amount: tx.amount,                  // statement amount is final (includes tips)
          isCredit: tx.isCredit,
          hash: tx.hash,
          uploadId: upload.id,
          merchant,
          categoryId: pendingMatch.categoryId ?? categoryId, // keep user's category if set
          isPending: false,
          isReconciled: true,
          source: "statement",
        },
      });
      savedId = pendingMatch.id;
      reconciled++;
      imported++;
    } else {
      // No pending match — create a fresh statement transaction
      const created = await prisma.transaction.create({
        data: {
          accountId,
          date: tx.date,
          description: tx.description,
          originalDescription: tx.description,
          amount: tx.amount,
          isCredit: tx.isCredit,
          hash: tx.hash,
          uploadId: upload.id,
          merchant,
          categoryId,
          source: "statement",
        },
      });
      savedId = created.id;
      imported++;
    }

    // Transfer pair detection
    const pairId = await detectTransferPair(
      householdAccountIds,
      tx.amount,
      tx.date,
      tx.isCredit,
      savedId
    );

    if (pairId) {
      await prisma.transaction.update({ where: { id: savedId }, data: { transferPairId: pairId } });
      await prisma.transaction.update({ where: { id: pairId }, data: { transferPairId: savedId } });
      transferPairsLinked.push([savedId, pairId]);
    }
  }

  return NextResponse.json({
    imported,
    skipped,
    reconciled,
    transferPairsLinked: transferPairsLinked.length,
    errors: parseResult.errors,
    uploadId: upload.id,
    detectedBank: "detectedBank" in parseResult ? parseResult.detectedBank : undefined,
  });
}
