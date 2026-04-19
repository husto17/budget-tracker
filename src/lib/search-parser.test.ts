import { describe, it, expect } from "vitest";
import { parseSearch } from "./search-parser";

describe("parseSearch", () => {
  it("treats plain text as fulltext search", () => {
    const r = parseSearch("starbucks");
    expect(r.text).toBe("starbucks");
    expect(r.amount).toBeUndefined();
  });

  it("parses amount:>N as minimum", () => {
    const r = parseSearch("amount:>100");
    expect(r.amountMin).toBeGreaterThan(100);
    expect(r.amountMin).toBeLessThan(100.01);
    expect(r.amountMax).toBeUndefined();
  });

  it("parses amount:<N as maximum", () => {
    const r = parseSearch("amount:<50");
    expect(r.amountMax).toBeLessThan(50);
    expect(r.amountMax).toBeGreaterThan(49.99);
  });

  it("parses amount range", () => {
    const r = parseSearch("amount:50-150");
    expect(r.amountMin).toBe(50);
    expect(r.amountMax).toBe(150);
  });

  it("parses amount exact", () => {
    const r = parseSearch("amount:42.50");
    expect(r.amount).toBe(42.5);
  });

  it("combines operators with plain text", () => {
    const r = parseSearch("coffee amount:>5 category:dining");
    expect(r.text).toBe("coffee");
    expect(r.amountMin).toBeGreaterThan(5);
    expect(r.categoryLike).toBe("dining");
  });

  it("handles quoted values with spaces", () => {
    const r = parseSearch('category:"food & drink"');
    expect(r.categoryLike).toBe("food & drink");
  });

  it("parses from: and to: as dates", () => {
    const r = parseSearch("from:2026-01-01 to:2026-03-31");
    expect(r.from?.getFullYear()).toBe(2026);
    expect(r.from?.getMonth()).toBe(0);
    expect(r.to?.getFullYear()).toBe(2026);
    expect(r.to?.getMonth()).toBe(2);
    // to: is end-of-day so lte matches
    expect(r.to?.getHours()).toBe(23);
  });

  it("ignores invalid dates", () => {
    const r = parseSearch("from:not-a-date");
    expect(r.from).toBeUndefined();
  });

  it("is case-insensitive on operator name", () => {
    const r = parseSearch("AMOUNT:>10 Category:food");
    expect(r.amountMin).toBeGreaterThan(10);
    expect(r.categoryLike).toBe("food");
  });

  it("returns empty text when input is empty", () => {
    expect(parseSearch("")).toEqual({ text: "" });
  });

  it("treats unknown operators as plain text (no silent drop)", () => {
    const r = parseSearch("mystery:value coffee");
    expect(r.text).toBe("mystery:value coffee");
  });
});
