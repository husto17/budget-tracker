import crypto from "crypto";
import type { ParsedTransaction } from "./csv-parser";

export interface PdfParseResult {
  transactions: ParsedTransaction[];
  errors: string[];
  rawText: string;
}

function hashTransaction(date: Date, description: string, amount: number): string {
  const str = `${date.toISOString().slice(0, 10)}|${description}|${amount}`;
  return crypto.createHash("sha256").update(str).digest("hex").slice(0, 16);
}

function parseAmount(val: string): number {
  return parseFloat(val.replace(/[£$€,\s]/g, "").replace(/[()]/g, (c) => c === "(" ? "-" : "")) || 0;
}

// Generic date regex patterns
const DATE_RE = /(\d{1,2}[\s\/\-]\w{3,9}[\s\/\-]\d{2,4}|\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4}|\d{4}[\/\-]\d{1,2}[\/\-]\d{1,2})/;
const AMOUNT_RE = /[£$€]?\s*[\d,]+\.\d{2}/g;

function parseDate(val: string): Date | null {
  const d = new Date(val);
  if (!isNaN(d.getTime())) return d;

  // Try DD MMM YYYY / DD MMM YY
  const m = val.match(/(\d{1,2})\s+([A-Za-z]{3})\s+(\d{2,4})/);
  if (m) {
    const year = m[3].length === 2 ? `20${m[3]}` : m[3];
    const d2 = new Date(`${m[2]} ${m[1]} ${year}`);
    if (!isNaN(d2.getTime())) return d2;
  }

  return null;
}

/**
 * Extract transactions from raw PDF text.
 *
 * Strategy: scan line by line for lines that contain a date and a money amount.
 * Works for most UK/US bank statement PDFs. If a bank uses multi-line entries,
 * we look ahead one line for the amount if the date line has none.
 */
export function parsePdfText(text: string): PdfParseResult {
  const errors: string[] = [];
  const transactions: ParsedTransaction[] = [];
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    const dateMatch = line.match(DATE_RE);
    if (!dateMatch) continue;

    const date = parseDate(dateMatch[1]);
    if (!date) continue;

    // Find all money amounts on this line (or next line)
    let amountLine = line;
    const directAmounts = line.match(AMOUNT_RE);
    if (!directAmounts && i + 1 < lines.length) {
      amountLine = lines[i + 1];
    }

    const amounts = amountLine.match(AMOUNT_RE);
    if (!amounts || amounts.length === 0) continue;

    // Description: everything between date and first amount
    const dateEnd = line.indexOf(dateMatch[1]) + dateMatch[1].length;
    const firstAmountIdx = line.indexOf(amounts[0]);
    let description: string;

    if (firstAmountIdx > dateEnd) {
      description = line.slice(dateEnd, firstAmountIdx).trim();
    } else {
      description = line.slice(dateEnd).trim();
    }

    if (!description) {
      // Try to use the preceding non-date line as description
      description = i > 0 ? lines[i - 1].slice(0, 60) : "Unknown";
    }

    // Determine amount and direction
    // If there are 2 amounts: last one is usually running balance, first is transaction
    const rawAmount = amounts[0];
    const amount = Math.abs(parseAmount(rawAmount));
    if (amount === 0) continue;

    // Heuristic: negative marker or keyword indicates debit
    const lineUpper = line.toUpperCase();
    const isCredit =
      lineUpper.includes("CREDIT") ||
      lineUpper.includes("DEPOSIT") ||
      lineUpper.includes("REFUND") ||
      lineUpper.includes("REVERSAL") ||
      lineUpper.includes("CASHBACK") ||
      (rawAmount.startsWith("+") && !rawAmount.startsWith("-"));

    transactions.push({
      date,
      description,
      amount,
      isCredit,
      hash: hashTransaction(date, description, amount),
    });
  }

  if (transactions.length === 0) {
    errors.push(
      "Could not automatically extract transactions from this PDF. " +
      "The format may not be supported. Try exporting as CSV from your bank."
    );
  }

  return { transactions, errors, rawText: text };
}
