import { describe, it, expect } from "vitest";
import { parsePdfText } from "./pdf-parser";

// These are lightweight text fixtures — real PDFs get flattened to text by
// pdf-parse before parsePdfText sees them. We don't need actual PDFs here.

describe("parsePdfText — statement metadata extraction", () => {
  it("captures Chase-style beginning + ending balance", () => {
    const text = `
      Statement Closing Date 04/06/2026
      Beginning Balance $1,234.56
      Ending Balance $2,456.78
      03/14 COFFEE SHOP -5.50 1,229.06
    `;
    const r = parsePdfText(text);
    expect(r.openingBalance).toBe(1234.56);
    expect(r.closingBalance).toBe(2456.78);
    expect(r.statementEnd?.getFullYear()).toBe(2026);
  });

  it("captures BofA-style Previous / New Balance", () => {
    const text = `
      Bank of America Credit Card
      Previous Balance $500.00
      New Balance $1,234.56
      Statement Period: 03/06/2026 - 04/05/2026
    `;
    const r = parsePdfText(text);
    expect(r.openingBalance).toBe(500);
    expect(r.closingBalance).toBe(1234.56);
    expect(r.statementStart?.getMonth()).toBe(2); // March
    expect(r.statementEnd?.getMonth()).toBe(3); // April
  });

  it("leaves balance fields undefined when header is absent", () => {
    const text = `03/14 COFFEE SHOP -5.50\n03/15 GROCERY -42.00`;
    const r = parsePdfText(text);
    expect(r.openingBalance).toBeUndefined();
    expect(r.closingBalance).toBeUndefined();
  });

  it("handles parenthesized negatives", () => {
    const text = `
      Wells Fargo
      Beginning Balance (100.00)
      Ending Balance 250.00
    `;
    const r = parsePdfText(text);
    expect(r.openingBalance).toBe(-100);
    expect(r.closingBalance).toBe(250);
  });
});

describe("parsePdfText — bank detection", () => {
  it("detects Chase from header", () => {
    const text = `JPMORGAN CHASE\n03/14 COFFEE -5.00`;
    const r = parsePdfText(text);
    expect(r.detectedBank).toMatch(/Chase/);
  });

  it("detects Wells Fargo", () => {
    const text = `WELLS FARGO BANK\n03/14/2026 STARBUCKS -5.00 100.00`;
    const r = parsePdfText(text);
    expect(r.detectedBank).toMatch(/Wells Fargo/);
  });

  it("falls back to generic when no bank marker", () => {
    const text = `03/14/2026 random description 42.00`;
    const r = parsePdfText(text);
    expect(r.detectedBank).toMatch(/generic|Unknown/);
  });
});

describe("parsePdfText — Chase checking transactions", () => {
  it("imports debits + credits with correct sign", () => {
    const text = `
      CHASE BANK
      Statement Closing Date 04/06/2026
      03/14 COFFEE SHOP -5.50 1,229.06
      03/15 PAYCHECK DEPOSIT 2,500.00 3,729.06
    `;
    const r = parsePdfText(text);
    expect(r.transactions.length).toBe(2);
    const coffee = r.transactions.find((t) => t.description.includes("COFFEE"));
    const pay = r.transactions.find((t) => t.description.includes("PAYCHECK"));
    expect(coffee?.isCredit).toBe(false);
    expect(coffee?.amount).toBe(5.5);
    expect(pay?.isCredit).toBe(true);
    expect(pay?.amount).toBe(2500);
  });
});
