import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { parseCsv } from "@/lib/csv-parser";
import { parsePdfText } from "@/lib/pdf-parser";
import { autoCategorize, normalizeMerchant, detectTransferPair } from "@/lib/auto-categorize";

export async function POST(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const formData = await request.formData();
  const file = formData.get("file") as File;
  const accountId = formData.get("accountId") as string;

  if (!file || !accountId) {
    return NextResponse.json({ error: "File and accountId are required" }, { status: 400 });
  }

  // Verify account belongs to user
  const account = await prisma.account.findUnique({ where: { id: accountId } });
  if (!account || account.userId !== session.user.id) {
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
    }, { status: 422 });
  }

  // Create upload record
  const upload = await prisma.upload.create({
    data: {
      userId: session.user.id,
      accountId,
      fileName,
      fileType,
      rowCount: parseResult.transactions.length,
    },
  });

  let imported = 0;
  let skipped = 0;
  const transferPairsLinked: Array<[string, string]> = [];

  for (const tx of parseResult.transactions) {
    // Check for duplicate
    const existing = await prisma.transaction.findUnique({
      where: { accountId_hash: { accountId, hash: tx.hash } },
    });
    if (existing) {
      skipped++;
      continue;
    }

    const merchant = normalizeMerchant(tx.description);
    const categoryId = await autoCategorize(session.user.id, tx.description);

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
      },
    });

    // Try to detect transfer pair
    const pairId = await detectTransferPair(
      session.user.id,
      tx.amount,
      tx.date,
      tx.isCredit,
      created.id
    );

    if (pairId) {
      // Link both
      await prisma.transaction.update({
        where: { id: created.id },
        data: { transferPairId: pairId },
      });
      await prisma.transaction.update({
        where: { id: pairId },
        data: { transferPairId: created.id },
      });
      transferPairsLinked.push([created.id, pairId]);
    }

    imported++;
  }

  return NextResponse.json({
    imported,
    skipped,
    transferPairsLinked: transferPairsLinked.length,
    errors: parseResult.errors,
    uploadId: upload.id,
    detectedBank: "detectedBank" in parseResult ? parseResult.detectedBank : undefined,
  });
}
