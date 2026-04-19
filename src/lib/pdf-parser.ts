import crypto from "crypto";
import type { ParsedTransaction } from "./csv-parser";

export interface PdfParseResult {
  transactions: ParsedTransaction[];
  errors: string[];
  rawText: string;
  detectedBank?: string;
  openingBalance?: number;
  closingBalance?: number;
  statementStart?: Date;
  statementEnd?: Date;
}

function hashTransaction(date: Date, description: string, amount: number): string {
  const str = `${date.toISOString().slice(0, 10)}|${description}|${amount}`;
  return crypto.createHash("sha256").update(str).digest("hex").slice(0, 16);
}

function parseSignedAmount(val: string): number {
  return parseFloat(val.replace(/,/g, "").replace(/[()]/g, (c) => (c === "(" ? "-" : ""))) || 0;
}

// ---------------------------------------------------------------------------
// Year inference — scans statement header text for a 4-digit year
// ---------------------------------------------------------------------------
function inferStatementYear(text: string): number {
  const currentYear = new Date().getFullYear();

  // "Statement Closing Date 04/06/2026" or "Statement Date: MM/DD/YYYY"
  const closingDate = text.match(/(?:closing|statement|period end(?:ing)?)\s*(?:date)?[:\s]+\d{1,2}\/\d{1,2}\/(\d{4})/i);
  if (closingDate) return parseInt(closingDate[1]);

  // "March 7 - April 6, 2026"
  const monthRange = text.match(/(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\s+\d{1,2}\s*[-–]\s*(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\s+\d{1,2},?\s*(\d{4})/i);
  if (monthRange) return parseInt(monthRange[1]);

  // Any 4-digit year near top of document (first 2000 chars)
  const topSection = text.slice(0, 2000);
  const yearMatch = topSection.match(/20\d{2}/);
  if (yearMatch) return parseInt(yearMatch[0]);

  return currentYear;
}

// Given a statement closing month and a transaction month, resolve the year.
// Handles year-boundary rollovers in both directions.
function resolveYear(baseYear: number, closingMonth: number, txMonth: number): number {
  // Closing in Jan–Mar with a tx in Oct–Dec → tx is the previous year
  // (e.g. Jan 2026 statement with a Dec 2025 transaction)
  if (closingMonth <= 3 && txMonth >= 10) return baseYear - 1;
  // Inferred year predates the statement period: closing in Oct–Dec with a
  // tx in Jan–Mar → tx is the following year. Rare, but guards against
  // inferStatementYear picking up an older year from the header.
  if (closingMonth >= 10 && txMonth <= 3) return baseYear + 1;
  return baseYear;
}

// ---------------------------------------------------------------------------
// Bank of America — Credit Card
// Format: MM/DD  MM/DD  DESCRIPTION  REFNUM  LASTFOUR  AMOUNT
// Credits are negative amounts (payments, refunds)
// ---------------------------------------------------------------------------
function parseBofaCreditCard(text: string, lines: string[]): ParsedTransaction[] {
  const year = inferStatementYear(text);
  const closingDateMatch = text.match(/Statement Closing Date\s+(\d{2})\/(\d{2})\/\d{4}/i);
  const closingMonth = closingDateMatch ? parseInt(closingDateMatch[1]) : new Date().getMonth() + 1;

  const transactions: ParsedTransaction[] = [];

  // pdf-parse concatenates adjacent narrow columns without spaces.
  // Observed format:
  //   Purchase: "MM/DDMM/DD description REF4ACCT4AMOUNT"  (amount on same line)
  //   Credit:   "MM/DDMM/DD description REF4ACCT4"        (amount on NEXT line, often with en-dash)
  //   Multi-line: "MM/DDMM/DD description" with ref/acct/amount on subsequent lines

  // Line starts with two consecutive MM/DD dates (no space between them)
  const TX_START_RE = /^(\d{2}\/\d{2})\d{2}\/\d{2}\s*/;

  // Tail of a purchase line:  ref(4) acct(4) amount  (all concatenated, no spaces)
  // Cap integer part to 6 digits so greedy match doesn't swallow ref+acct digits
  const TAIL_WITH_AMOUNT_RE = /(\d{4})(\d{4})([\d,]{1,6}\.\d{2})$/;
  // Tail of a credit line: ref(4) acct(4) with NO decimal amount after
  const TAIL_ACCT_ONLY_RE  = /(\d{4})\s*(\d{4})$/;

  // Standalone amount line (credit amount appears on the line after the tx line)
  // Handles hyphen-minus OR en-dash (U+2013) as the negative sign
  const CREDIT_AMOUNT_LINE_RE = /^[-\u2013]?\s*([\d,]+\.\d{2})$/;

  // ref(4) acct(4) amount on its own line (multi-line entries like Uber FX)
  const REF_ACCT_AMOUNT_LINE_RE = /^(\d{4})\s*(\d{4})\s*([\d,]+\.\d{2})$/;

  const SKIP_RE = /^(TOTAL\s|INTEREST CHARGED ON|Payments and Other Credits|Purchases and Adjustments|Fees Charged|Fees$|Interest Charged|Transaction\s+Date|Posting\s+Date|\d{4}\s+Totals|continued on|Transactions Continued)/i;

  // Track which section we're in so we know isCredit without relying on the sign
  let inCreditsSection = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    if (/^Payments and Other Credits/i.test(line)) { inCreditsSection = true; continue; }
    if (/^Purchases and Adjustments/i.test(line))  { inCreditsSection = false; continue; }
    if (/^Fees/i.test(line))                        { inCreditsSection = false; continue; }
    if (/^Interest Charged/i.test(line))            { break; }
    if (SKIP_RE.test(line)) continue;

    const startMatch = line.match(TX_START_RE);
    if (!startMatch) continue;

    const txDateStr = startMatch[1];
    const remainder = line.slice(startMatch[0].length);

    let description: string | undefined;
    let amountStr: string | undefined;
    const isCredit = inCreditsSection;

    // Case 1: purchase — ends with ref4 acct4 amount
    const tailAmount = remainder.match(TAIL_WITH_AMOUNT_RE);
    if (tailAmount) {
      amountStr = tailAmount[3];
      description = remainder.slice(0, remainder.length - tailAmount[0].length).trim();
    } else {
      // Case 2: credit — ends with ref4 acct4 (no amount); amount on the very next line
      const tailAcct = remainder.match(TAIL_ACCT_ONLY_RE);
      if (tailAcct) {
        description = remainder.slice(0, remainder.length - tailAcct[0].length).trim();
        // Look at next 1-2 lines for the credit amount
        for (let j = i + 1; j <= Math.min(i + 2, lines.length - 1); j++) {
          const next = lines[j];
          const creditAmt = next.match(CREDIT_AMOUNT_LINE_RE);
          if (creditAmt) { amountStr = creditAmt[1]; i = j; break; }
          // If next line is another transaction or section header, stop
          if (TX_START_RE.test(next) || SKIP_RE.test(next)) break;
        }
      } else {
        // Case 3: multi-line — description wraps; ref/acct/amount on a following line
        description = remainder.trim();
        for (let j = i + 1; j <= Math.min(i + 4, lines.length - 1); j++) {
          const next = lines[j];
          const refAcctAmt = next.match(REF_ACCT_AMOUNT_LINE_RE);
          if (refAcctAmt) { amountStr = refAcctAmt[3]; i = j; break; }
          if (/^[\d,]+\.\d+\s+[A-Z]{3}$/.test(next)) continue; // FX line
          if (TX_START_RE.test(next) || SKIP_RE.test(next)) break; // new tx
          description = description + " " + next; // description continuation
        }
      }
    }

    if (!txDateStr || !description || !amountStr) continue;
    if (/^TOTAL\s/i.test(description)) continue;

    const amount = parseFloat(amountStr.replace(/,/g, ""));
    if (amount === 0) continue;

    const [month, day] = txDateStr.split("/").map(Number);
    const txYear = resolveYear(year, closingMonth, month);
    const date = new Date(txYear, month - 1, day);
    if (isNaN(date.getTime())) continue;

    transactions.push({
      date,
      description: description.trim(),
      amount,
      isCredit,
      hash: hashTransaction(date, description.trim(), amount),
    });
  }

  return transactions;
}

// ---------------------------------------------------------------------------
// Bank of America — Checking / Savings
// Format: MM/DD/YYYY  DESCRIPTION  AMOUNT  RUNNING_BALANCE
// Or:     MM/DD/YYYY  DESCRIPTION  DEBIT   CREDIT  BALANCE
// ---------------------------------------------------------------------------
function parseBofaChecking(text: string, lines: string[]): ParsedTransaction[] {
  const transactions: ParsedTransaction[] = [];
  // Date + description + optional debit/credit/balance columns
  // "04/01/2026  ACH CREDIT PAYROLL         2,500.00            5,123.00"
  // "04/02/2026  PURCHASE STARBUCKS             4.50  5,118.50"
  const LINE_RE = /^(\d{2}\/\d{2}\/\d{4})\s+(.+?)\s+(-?[\d,]+\.\d{2})(?:\s+[\d,]+\.\d{2})*$/;

  for (const line of lines) {
    const m = line.match(LINE_RE);
    if (!m) continue;
    const [, dateStr, description, amountStr] = m;
    const date = new Date(dateStr);
    if (isNaN(date.getTime())) continue;
    const raw = parseSignedAmount(amountStr);
    if (raw === 0) continue;
    const isCredit = raw > 0;
    transactions.push({
      date,
      description: description.trim(),
      amount: Math.abs(raw),
      isCredit,
      hash: hashTransaction(date, description.trim(), Math.abs(raw)),
    });
  }
  return transactions;
}

// ---------------------------------------------------------------------------
// Chase — Credit Card & Checking
// Credit card: MM/DD  MM/DD  DESCRIPTION  AMOUNT
// Checking:    MM/DD  DESCRIPTION  AMOUNT  BALANCE
// ---------------------------------------------------------------------------
function parseChase(text: string, lines: string[]): ParsedTransaction[] {
  const year = inferStatementYear(text);
  const closingDateMatch = text.match(/(?:through|closing|ending|statement date)\s+(\d{2})\/(\d{2})\/(\d{4})/i);
  const closingMonth = closingDateMatch ? parseInt(closingDateMatch[1]) : new Date().getMonth() + 1;
  const transactions: ParsedTransaction[] = [];

  // Chase credit card: "03/14 03/15 WHOLE FOODS MARKET #12345 -52.40" (negative = debit)
  // Chase checking:    "03/14 ACH PMT CHASE CREDIT CRD -1,200.00"
  // Amount sign convention varies — debits can be positive or negative depending on statement type
  const CC_LINE_RE = /^(\d{2}\/\d{2})\s+\d{2}\/\d{2}\s+(.+?)\s+(-?[\d,]+\.\d{2})$/;
  const CHK_LINE_RE = /^(\d{2}\/\d{2})\s+(.+?)\s+(-?[\d,]+\.\d{2})(?:\s+[\d,]+\.\d{2})?$/;
  const SKIP_RE = /^(DATE\s|TRANSACTION\s|PAYMENT THANK YOU|Deposits|Withdrawals|Beginning Balance|Ending Balance)/i;

  // Detect credit card mode by presence of two consecutive MM/DD patterns
  const isCreditCard = /^\d{2}\/\d{2}\s+\d{2}\/\d{2}\s+/m.test(text);
  const LINE_RE = isCreditCard ? CC_LINE_RE : CHK_LINE_RE;

  for (const line of lines) {
    if (SKIP_RE.test(line)) continue;
    const m = line.match(LINE_RE);
    if (!m) continue;
    const [, dateStr, description, amountStr] = m;
    const raw = parseSignedAmount(amountStr);
    if (raw === 0) continue;
    const [month, day] = dateStr.split("/").map(Number);
    const txYear = resolveYear(year, closingMonth, month);
    const date = new Date(txYear, month - 1, day);
    if (isNaN(date.getTime())) continue;
    // Chase: negative = debit (money out), positive = credit (money in)
    const isCredit = raw > 0;
    transactions.push({
      date,
      description: description.trim(),
      amount: Math.abs(raw),
      isCredit,
      hash: hashTransaction(date, description.trim(), Math.abs(raw)),
    });
  }
  return transactions;
}

// ---------------------------------------------------------------------------
// Wells Fargo — Checking / Savings / Credit Card
// Format: MM/DD/YYYY  DESCRIPTION  AMOUNT  RUNNING_BALANCE
// Or credit card: MM/DD/YYYY  MM/DD/YYYY  DESCRIPTION  AMOUNT
// ---------------------------------------------------------------------------
function parseWellsFargo(text: string, lines: string[]): ParsedTransaction[] {
  const transactions: ParsedTransaction[] = [];
  // Two-date format (credit card): "03/14/2026 03/15/2026 AMAZON.COM*12345678 -45.99"
  const CC_LINE_RE = /^(\d{2}\/\d{2}\/\d{4})\s+\d{2}\/\d{2}\/\d{4}\s+(.+?)\s+(-?[\d,]+\.\d{2})$/;
  // Single-date format (checking): "03/14/2026 PURCHASE WHOLE FOODS -45.99 3,200.00"
  const CHK_LINE_RE = /^(\d{2}\/\d{2}\/\d{4})\s+(.+?)\s+(-?[\d,]+\.\d{2})(?:\s+[\d,]+\.\d{2})?$/;
  const SKIP_RE = /^(DATE\s|TRANSACTION\s|Beginning|Ending|Total\s)/i;

  const isCreditCard = /^\d{2}\/\d{2}\/\d{4}\s+\d{2}\/\d{2}\/\d{4}/m.test(text);
  const LINE_RE = isCreditCard ? CC_LINE_RE : CHK_LINE_RE;

  for (const line of lines) {
    if (SKIP_RE.test(line)) continue;
    const m = line.match(LINE_RE);
    if (!m) continue;
    const [, dateStr, description, amountStr] = m;
    const date = new Date(dateStr);
    if (isNaN(date.getTime())) continue;
    const raw = parseSignedAmount(amountStr);
    if (raw === 0) continue;
    // WF: positive = credit (deposit), negative = debit (purchase)
    const isCredit = raw > 0;
    transactions.push({
      date,
      description: description.trim(),
      amount: Math.abs(raw),
      isCredit,
      hash: hashTransaction(date, description.trim(), Math.abs(raw)),
    });
  }
  return transactions;
}

// ---------------------------------------------------------------------------
// Citi — Credit Card
// Format: MM/DD/YYYY  DESCRIPTION  DEBIT_AMOUNT  or  MM/DD/YYYY  DESCRIPTION  -CREDIT_AMOUNT
// Some formats: TRANSACTION_DATE  POST_DATE  DESCRIPTION  AMOUNT
// ---------------------------------------------------------------------------
function parseCiti(text: string, lines: string[]): ParsedTransaction[] {
  const transactions: ParsedTransaction[] = [];
  // "04/01/2026   04/03/2026   AMAZON MKTPL*123456789        -89.99"
  const CC_LINE_RE = /^(\d{2}\/\d{2}\/\d{4})\s+\d{2}\/\d{2}\/\d{4}\s+(.+?)\s{2,}(-?[\d,]+\.\d{2})$/;
  // "04/01   AMAZON MKTPL*123456789        -89.99"
  const SIMPLE_RE = /^(\d{2}\/\d{2}\/\d{4})\s+(.+?)\s{2,}(-?[\d,]+\.\d{2})$/;
  const SKIP_RE = /^(Date\s|Transaction\s|Total\s|Payment\s+Thank\s+You)/i;

  const hasTwoDates = /^\d{2}\/\d{2}\/\d{4}\s+\d{2}\/\d{2}\/\d{4}/m.test(text);
  const LINE_RE = hasTwoDates ? CC_LINE_RE : SIMPLE_RE;

  for (const line of lines) {
    if (SKIP_RE.test(line)) continue;
    const m = line.match(LINE_RE);
    if (!m) continue;
    const [, dateStr, description, amountStr] = m;
    const date = new Date(dateStr);
    if (isNaN(date.getTime())) continue;
    const raw = parseSignedAmount(amountStr);
    if (raw === 0) continue;
    // Citi: negative = credit (payment/refund), positive = debit (purchase)
    const isCredit = raw < 0;
    transactions.push({
      date,
      description: description.trim(),
      amount: Math.abs(raw),
      isCredit,
      hash: hashTransaction(date, description.trim(), Math.abs(raw)),
    });
  }
  return transactions;
}

// ---------------------------------------------------------------------------
// Capital One — Credit Card
// Format: MM/DD/YYYY  MM/DD/YYYY  CARD_LAST4  DESCRIPTION  CATEGORY  DEBIT  CREDIT
// Or simplified: TRANSACTION_DATE  POSTED_DATE  DESCRIPTION  DEBIT  CREDIT
// ---------------------------------------------------------------------------
function parseCapitalOne(text: string, lines: string[]): ParsedTransaction[] {
  const transactions: ParsedTransaction[] = [];
  // "03/14/2026 03/15/2026 1234 AMAZON.COM Shopping 45.99"
  // "03/20/2026 03/20/2026 1234 PAYMENT THANK YOU Payment  1,200.00"
  const LINE_RE = /^(\d{2}\/\d{2}\/\d{4})\s+\d{2}\/\d{2}\/\d{4}\s+\d{4}\s+(.+?)\s+[\w\s&/]+\s+([\d,]+\.\d{2})\s*$/;
  // Simpler fallback: date  description  debit  credit
  const SIMPLE_RE = /^(\d{2}\/\d{2}\/\d{4})\s+(.+?)\s+([\d,]+\.\d{2})\s*([\d,]+\.\d{2})?$/;
  const SKIP_RE = /^(Trans(?:action)?\s+Date|Posted\s+Date|Total\s|Payment\s+Due)/i;

  for (const line of lines) {
    if (SKIP_RE.test(line)) continue;
    let m = line.match(LINE_RE);
    if (!m) m = line.match(SIMPLE_RE);
    if (!m) continue;
    const [, dateStr, description, debitStr, creditStr] = m;
    const date = new Date(dateStr);
    if (isNaN(date.getTime())) continue;
    const debit = parseSignedAmount(debitStr || "");
    const credit = parseSignedAmount(creditStr || "");
    let amount: number;
    let isCredit: boolean;
    if (credit > 0) {
      amount = credit;
      isCredit = true;
    } else if (debit > 0) {
      amount = debit;
      isCredit = false;
    } else continue;
    transactions.push({
      date,
      description: description.trim(),
      amount,
      isCredit,
      hash: hashTransaction(date, description.trim(), amount),
    });
  }
  return transactions;
}

// ---------------------------------------------------------------------------
// American Express — Credit Card
// Format: MM/DD/YYYY  DESCRIPTION  AMOUNT
// Credits shown as negative; purchases positive
// ---------------------------------------------------------------------------
function parseAmex(text: string, lines: string[]): ParsedTransaction[] {
  const year = inferStatementYear(text);
  const transactions: ParsedTransaction[] = [];
  // "03/14/26  WHOLE FOODS #1234     NEW YORK NY       52.40"
  // "03/20/26  PAYMENT RECEIVED                      -1,200.00"
  const LINE_RE = /^(\d{2}\/\d{2}\/\d{2,4})\s+(.+?)\s{2,}(-?[\d,]+\.\d{2})$/;
  const SKIP_RE = /^(Date\s|Reference\s|Total\s|Opening\s|Closing\s|New\s+Charges)/i;
  void year; // year is already embedded in Amex dates

  for (const line of lines) {
    if (SKIP_RE.test(line)) continue;
    const m = line.match(LINE_RE);
    if (!m) continue;
    const [, dateStr, description, amountStr] = m;
    // Handle 2-digit years (03/14/26 → 2026)
    const dateParts = dateStr.split("/");
    if (dateParts[2].length === 2) dateParts[2] = `20${dateParts[2]}`;
    const date = new Date(`${dateParts[0]}/${dateParts[1]}/${dateParts[2]}`);
    if (isNaN(date.getTime())) continue;
    const raw = parseSignedAmount(amountStr);
    if (raw === 0) continue;
    const isCredit = raw < 0;
    transactions.push({
      date,
      description: description.trim(),
      amount: Math.abs(raw),
      isCredit,
      hash: hashTransaction(date, description.trim(), Math.abs(raw)),
    });
  }
  return transactions;
}

// ---------------------------------------------------------------------------
// Discover — Credit Card
// Format: Trans. Date  Post Date  Description  Amount
// Credits shown as negative
// ---------------------------------------------------------------------------
function parseDiscover(text: string, lines: string[]): ParsedTransaction[] {
  const transactions: ParsedTransaction[] = [];
  const LINE_RE = /^(\d{2}\/\d{2}\/\d{4})\s+\d{2}\/\d{2}\/\d{4}\s+(.+?)\s{2,}(-?[\d,]+\.\d{2})$/;
  const SKIP_RE = /^(Trans\.?\s+Date|Post\s+Date|Total\s)/i;

  for (const line of lines) {
    if (SKIP_RE.test(line)) continue;
    const m = line.match(LINE_RE);
    if (!m) continue;
    const [, dateStr, description, amountStr] = m;
    const date = new Date(dateStr);
    if (isNaN(date.getTime())) continue;
    const raw = parseSignedAmount(amountStr);
    if (raw === 0) continue;
    const isCredit = raw < 0;
    transactions.push({
      date,
      description: description.trim(),
      amount: Math.abs(raw),
      isCredit,
      hash: hashTransaction(date, description.trim(), Math.abs(raw)),
    });
  }
  return transactions;
}

// ---------------------------------------------------------------------------
// Generic fallback — scans for any line with a date pattern and a money amount
// ---------------------------------------------------------------------------
function parseGeneric(text: string, lines: string[]): ParsedTransaction[] {
  const year = inferStatementYear(text);
  const transactions: ParsedTransaction[] = [];

  const DATE_RE = /(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4}|\d{4}[\/\-]\d{1,2}[\/\-]\d{1,2})/;
  const AMOUNT_RE = /[£$€]?\s*(-?[\d,]+\.\d{2})/g;

  for (const line of lines) {
    const dateMatch = line.match(DATE_RE);
    if (!dateMatch) continue;

    let date = new Date(dateMatch[1]);
    if (isNaN(date.getTime())) {
      // Try adding current year for MM/DD
      const shortDate = dateMatch[1].match(/^(\d{1,2})\/(\d{1,2})$/);
      if (shortDate) date = new Date(year, parseInt(shortDate[1]) - 1, parseInt(shortDate[2]));
    }
    if (isNaN(date.getTime())) continue;

    const amounts = [...line.matchAll(AMOUNT_RE)];
    if (amounts.length === 0) continue;

    const rawAmount = amounts[0][1];
    const amount = Math.abs(parseSignedAmount(rawAmount));
    if (amount === 0) continue;

    const dateEnd = line.indexOf(dateMatch[1]) + dateMatch[1].length;
    const firstAmountIdx = line.indexOf(amounts[0][0]);
    let description = firstAmountIdx > dateEnd
      ? line.slice(dateEnd, firstAmountIdx).trim()
      : line.slice(dateEnd).trim();
    if (!description || description.length < 2) continue;

    const lineUpper = line.toUpperCase();
    const isCredit =
      parseSignedAmount(rawAmount) > 0
        ? true
        : lineUpper.includes("CREDIT") ||
          lineUpper.includes("DEPOSIT") ||
          lineUpper.includes("REFUND") ||
          lineUpper.includes("PAYMENT");

    transactions.push({
      date,
      description,
      amount,
      isCredit,
      hash: hashTransaction(date, description, amount),
    });
  }
  return transactions;
}

// ---------------------------------------------------------------------------
// Bank detection
// ---------------------------------------------------------------------------
function detectBank(text: string): string {
  const upper = text.slice(0, 3000).toUpperCase();
  if (upper.includes("BANK OF AMERICA")) return "bofa";
  if (upper.includes("CHASE") || upper.includes("JPMORGAN")) return "chase";
  if (upper.includes("WELLS FARGO")) return "wellsfargo";
  if (upper.includes("CITIBANK") || upper.includes("CITI BANK") || upper.includes("CITICARDS")) return "citi";
  if (upper.includes("CAPITAL ONE")) return "capitalone";
  if (upper.includes("AMERICAN EXPRESS") || upper.includes("AMEX")) return "amex";
  if (upper.includes("DISCOVER BANK") || upper.includes("DISCOVER CARD")) return "discover";
  return "generic";
}

// ---------------------------------------------------------------------------
// Statement-level metadata extraction — opening/closing balance + date range.
// Uses broad regex patterns that cover Chase / BofA / Wells Fargo / Citi / Amex
// / Capital One / Discover statement headers. Values are best-effort: returns
// undefined fields when no confident match exists.
// ---------------------------------------------------------------------------
function parseMoney(s: string): number | undefined {
  // Handles "$1,234.56", "(1,234.56)", "1,234.56-", en-dash, etc.
  const cleaned = s.replace(/[$,\s]/g, "").replace(/[\u2013\u2014]/g, "-");
  const parenNeg = /^\(([\d.]+)\)$/.exec(cleaned);
  const trailNeg = /^([\d.]+)-$/.exec(cleaned);
  const num = parenNeg
    ? -parseFloat(parenNeg[1])
    : trailNeg
    ? -parseFloat(trailNeg[1])
    : parseFloat(cleaned);
  return Number.isFinite(num) ? num : undefined;
}

function extractStatementMeta(text: string): {
  openingBalance?: number;
  closingBalance?: number;
  statementStart?: Date;
  statementEnd?: Date;
} {
  const meta: {
    openingBalance?: number;
    closingBalance?: number;
    statementStart?: Date;
    statementEnd?: Date;
  } = {};

  // Opening balance — Chase "Beginning Balance $1,234.56", BofA "Previous Balance",
  // WF "Beginning balance on MM/DD", Amex "Previous Balance".
  const openRe = /(?:Beginning|Opening|Previous|Starting)(?:\s+Balance(?:\s+on\s+\d{1,2}\/\d{1,2}(?:\/\d{2,4})?)?)?\s*\.?\s*:?\s*-?\$?\s*\(?([\d,]+\.\d{2})\)?/i;
  const openMatch = text.match(openRe);
  if (openMatch) {
    const v = parseMoney(openMatch[1]);
    if (v !== undefined) meta.openingBalance = v;
  }

  // Closing balance — "Ending Balance $x", "New Balance $x", "Statement Balance $x".
  // Avoid "Minimum Payment" and "Interest Charged" by matching at line start.
  const closeRe = /(?:Ending|Closing|New|Statement)\s+Balance\s*\.?\s*:?\s*-?\$?\s*\(?([\d,]+\.\d{2})\)?/i;
  const closeMatch = text.match(closeRe);
  if (closeMatch) {
    const v = parseMoney(closeMatch[1]);
    if (v !== undefined) meta.closingBalance = v;
  }

  // Statement period — "Statement Period: MM/DD/YYYY - MM/DD/YYYY" / "through MM/DD/YYYY"
  // Also handles "March 7 - April 6, 2026" style.
  const periodNumericRe =
    /(?:Statement\s+Period|Period|Billing\s+Cycle|Cycle)[:\s]*\s*(\d{1,2}\/\d{1,2}\/\d{2,4})\s*[-–]\s*(\d{1,2}\/\d{1,2}\/\d{2,4})/i;
  const pn = text.match(periodNumericRe);
  if (pn) {
    const start = new Date(pn[1]);
    const end = new Date(pn[2]);
    if (!isNaN(start.getTime())) meta.statementStart = start;
    if (!isNaN(end.getTime())) meta.statementEnd = end;
  }

  if (!meta.statementEnd) {
    // "Closing Date 04/06/2026" / "Statement Closing Date: MM/DD/YYYY"
    const closingDate = text.match(
      /(?:Statement\s+)?(?:Closing|Ending|Statement)\s+Date\s*:?\s*(\d{1,2}\/\d{1,2}\/\d{2,4})/i,
    );
    if (closingDate) {
      const d = new Date(closingDate[1]);
      if (!isNaN(d.getTime())) meta.statementEnd = d;
    }
  }

  if (!meta.statementStart && meta.statementEnd) {
    // "From MM/DD/YYYY to MM/DD/YYYY" / "Opening date MM/DD/YYYY"
    const startAlt = text.match(
      /(?:Opening\s+Date|From|Statement\s+Start|Period\s+Start)\s*:?\s*(\d{1,2}\/\d{1,2}\/\d{2,4})/i,
    );
    if (startAlt) {
      const d = new Date(startAlt[1]);
      if (!isNaN(d.getTime())) meta.statementStart = d;
    }
  }

  return meta;
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------
export function parsePdfText(text: string): PdfParseResult {
  const errors: string[] = [];
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);

  const bank = detectBank(text);
  let transactions: ParsedTransaction[] = [];
  let detectedBank: string | undefined;

  // BofA: distinguish credit card vs checking by statement structure
  if (bank === "bofa") {
    // Credit card statements have "Account #" with 16-digit format and "Visa/Mastercard/etc."
    const isCreditCard =
      /Visa|Mastercard|World\s+Master|Cash\s+Rewards|Travel\s+Rewards|Unlimited\s+Cash/i.test(text) ||
      /Account\s*#\s*\d{4}\s+\d{4}\s+\d{4}\s+\d{4}/i.test(text);

    if (isCreditCard) {
      transactions = parseBofaCreditCard(text, lines);
      detectedBank = "Bank of America Credit Card";
    } else {
      transactions = parseBofaChecking(text, lines);
      detectedBank = "Bank of America Checking/Savings";
    }
  } else if (bank === "chase") {
    transactions = parseChase(text, lines);
    detectedBank = "Chase";
  } else if (bank === "wellsfargo") {
    transactions = parseWellsFargo(text, lines);
    detectedBank = "Wells Fargo";
  } else if (bank === "citi") {
    transactions = parseCiti(text, lines);
    detectedBank = "Citibank";
  } else if (bank === "capitalone") {
    transactions = parseCapitalOne(text, lines);
    detectedBank = "Capital One";
  } else if (bank === "amex") {
    transactions = parseAmex(text, lines);
    detectedBank = "American Express";
  } else if (bank === "discover") {
    transactions = parseDiscover(text, lines);
    detectedBank = "Discover";
  }

  // If bank-specific parser found nothing, fall back to generic
  if (transactions.length === 0) {
    transactions = parseGeneric(text, lines);
    detectedBank = detectedBank ? `${detectedBank} (generic fallback)` : "Unknown bank (generic)";
  }

  if (transactions.length === 0) {
    errors.push(
      "Could not extract transactions from this PDF." +
        (detectedBank ? ` Detected: ${detectedBank}.` : "") +
        " Try exporting as CSV from your bank's website instead."
    );
  }

  const meta = extractStatementMeta(text);

  return {
    transactions,
    errors,
    rawText: text,
    detectedBank,
    openingBalance: meta.openingBalance,
    closingBalance: meta.closingBalance,
    statementStart: meta.statementStart,
    statementEnd: meta.statementEnd,
  };
}
