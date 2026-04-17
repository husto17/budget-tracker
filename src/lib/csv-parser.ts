import Papa from "papaparse";
import crypto from "crypto";

export interface ParsedTransaction {
  date: Date;
  description: string;
  amount: number;
  isCredit: boolean;
  hash: string;
}

export interface CsvParseResult {
  transactions: ParsedTransaction[];
  errors: string[];
  rawHeaders: string[];
}

// Common column name patterns for auto-detection
const DATE_PATTERNS = /^(date|transaction.?date|posted.?date|trans.?date|value.?date|booking.?date)$/i;
const DESC_PATTERNS = /^(description|original.?description|simple.?description|merchant|payee|memo|narrative|details|transaction.?description|reference|particulars|beneficiary)$/i;
const AMOUNT_PATTERNS = /^(amount|transaction.?amount|debit\/credit|net.?amount|value)$/i;
const DEBIT_PATTERNS = /^(debit|withdrawals?|out|money.?out|payment|dr\.?)$/i;
const CREDIT_PATTERNS = /^(credit|deposits?|in|money.?in|received|cr\.?)$/i;

function parseDate(val: string): Date | null {
  if (!val) return null;
  // Try common formats: DD/MM/YYYY, MM/DD/YYYY, YYYY-MM-DD, DD-MM-YYYY, DD MMM YYYY
  const formats = [
    /^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/,
    /^(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})$/,
    /^(\d{1,2})\s+([A-Za-z]{3,})\s+(\d{4})$/,
  ];

  for (const fmt of formats) {
    const m = val.match(fmt);
    if (m) {
      const d = new Date(val);
      if (!isNaN(d.getTime())) return d;
    }
  }

  const d = new Date(val);
  return isNaN(d.getTime()) ? null : d;
}

function parseAmount(val: string): number {
  if (!val) return 0;
  // Remove currency symbols, commas, spaces
  const cleaned = val.replace(/[£$€,\s]/g, "").replace(/[()]/g, (c) => c === "(" ? "-" : "");
  return parseFloat(cleaned) || 0;
}

function hashTransaction(date: Date, description: string, amount: number): string {
  const str = `${date.toISOString().slice(0, 10)}|${description}|${amount}`;
  return crypto.createHash("sha256").update(str).digest("hex").slice(0, 16);
}

function detectColumns(headers: string[]): {
  dateCol?: string;
  descCol?: string;
  amountCol?: string;
  debitCol?: string;
  creditCol?: string;
} {
  const result: ReturnType<typeof detectColumns> = {};

  for (const h of headers) {
    const trimmed = h.trim();
    if (!result.dateCol && DATE_PATTERNS.test(trimmed)) result.dateCol = h;
    else if (!result.descCol && DESC_PATTERNS.test(trimmed)) result.descCol = h;
    else if (!result.amountCol && AMOUNT_PATTERNS.test(trimmed)) result.amountCol = h;
    else if (!result.debitCol && DEBIT_PATTERNS.test(trimmed)) result.debitCol = h;
    else if (!result.creditCol && CREDIT_PATTERNS.test(trimmed)) result.creditCol = h;
  }

  return result;
}

export function parseCsv(csvText: string): CsvParseResult {
  const errors: string[] = [];

  // Some banks (e.g. BofA activity export) prepend metadata lines before the real header.
  // Skip lines until we find one that looks like a header row (contains at least one
  // recognised column name). Cap the scan at 15 lines to avoid eating real data.
  let cleanedText = csvText;
  const rawLines = csvText.split(/\r?\n/);
  for (let skip = 0; skip < Math.min(15, rawLines.length - 1); skip++) {
    const headerLine = rawLines[skip].toLowerCase();
    if (
      DATE_PATTERNS.test(headerLine.split(",")[0]?.trim().replace(/"/g, "")) ||
      headerLine.includes("date") ||
      headerLine.includes("description") ||
      headerLine.includes("payee") ||
      headerLine.includes("amount")
    ) {
      cleanedText = rawLines.slice(skip).join("\n");
      break;
    }
  }

  const result = Papa.parse<Record<string, string>>(cleanedText, {
    header: true,
    skipEmptyLines: true,
    transformHeader: (h: string) => h.trim().replace(/^"|"$/g, ""),
  });

  const rawHeaders = result.meta?.fields ?? [];
  const cols = detectColumns(rawHeaders);

  if (!cols.dateCol) {
    errors.push("Could not detect date column. Headers found: " + rawHeaders.join(", "));
  }
  if (!cols.descCol) {
    errors.push("Could not detect description column.");
  }
  if (!cols.amountCol && !cols.debitCol && !cols.creditCol) {
    errors.push("Could not detect amount column.");
  }

  if (errors.length > 0) {
    return { transactions: [], errors, rawHeaders };
  }

  const transactions: ParsedTransaction[] = [];

  for (let i = 0; i < (result.data?.length ?? 0); i++) {
    const row = result.data![i];
    const rowNum = i + 2; // 1-indexed, +1 for header

    const dateVal = row[cols.dateCol!]?.trim();
    const descVal = row[cols.descCol!]?.trim();

    const date = parseDate(dateVal);
    if (!date) {
      errors.push(`Row ${rowNum}: Could not parse date "${dateVal}"`);
      continue;
    }
    if (!descVal) {
      errors.push(`Row ${rowNum}: Empty description`);
      continue;
    }

    let amount = 0;
    let isCredit = false;

    if (cols.amountCol) {
      const raw = row[cols.amountCol]?.trim();
      amount = parseAmount(raw);
      // Negative = debit, positive = credit for single-amount columns
      isCredit = amount > 0;
      amount = Math.abs(amount);
    } else {
      const debitRaw = row[cols.debitCol!]?.trim();
      const creditRaw = row[cols.creditCol!]?.trim();
      const debit = parseAmount(debitRaw);
      const credit = parseAmount(creditRaw);

      if (credit > 0) {
        amount = credit;
        isCredit = true;
      } else if (debit > 0) {
        amount = debit;
        isCredit = false;
      } else {
        errors.push(`Row ${rowNum}: No valid amount`);
        continue;
      }
    }

    transactions.push({
      date,
      description: descVal,
      amount,
      isCredit,
      hash: hashTransaction(date, descVal, amount),
    });
  }

  return { transactions, errors, rawHeaders };
}
