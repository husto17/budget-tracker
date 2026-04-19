import { describe, it, expect } from "vitest";
import { assignDuplicateOrdinals, type ParsedTransaction } from "./csv-parser";

function mkTx(date: string, desc: string, amount: number, hash = "h"): ParsedTransaction {
  return {
    date: new Date(date),
    description: desc,
    amount,
    isCredit: false,
    hash,
  };
}

describe("assignDuplicateOrdinals", () => {
  it("leaves a unique-key row's hash unchanged", () => {
    const rows = [mkTx("2026-04-19", "Coffee", 5, "H1")];
    const out = assignDuplicateOrdinals(rows);
    expect(out[0].hash).toBe("H1");
  });

  it("re-hashes the second of two identical rows", () => {
    const rows = [
      mkTx("2026-04-19", "Coffee", 5, "H1"),
      mkTx("2026-04-19", "Coffee", 5, "H1"),
    ];
    const out = assignDuplicateOrdinals(rows);
    expect(out[0].hash).toBe("H1");
    expect(out[1].hash).not.toBe("H1");
  });

  it("is idempotent on re-parse — same input produces same hashes", () => {
    const input = () => [
      mkTx("2026-04-19", "Coffee", 5, "H1"),
      mkTx("2026-04-19", "Coffee", 5, "H1"),
      mkTx("2026-04-19", "Coffee", 5, "H1"),
    ];
    const a = assignDuplicateOrdinals(input());
    const b = assignDuplicateOrdinals(input());
    expect(a.map((x) => x.hash)).toEqual(b.map((x) => x.hash));
  });

  it("treats rows with different amounts as unique", () => {
    const rows = [
      mkTx("2026-04-19", "Coffee", 5, "A"),
      mkTx("2026-04-19", "Coffee", 6, "B"),
    ];
    const out = assignDuplicateOrdinals(rows);
    expect(out[0].hash).toBe("A");
    expect(out[1].hash).toBe("B");
  });

  it("treats rows on different dates as unique", () => {
    const rows = [
      mkTx("2026-04-19", "Coffee", 5, "A"),
      mkTx("2026-04-20", "Coffee", 5, "A"),
    ];
    const out = assignDuplicateOrdinals(rows);
    expect(out[0].hash).toBe("A");
    expect(out[1].hash).toBe("A"); // different date → ordinal 0 again
  });

  it("assigns monotonically-increasing ordinals for a triple-duplicate", () => {
    const rows = [
      mkTx("2026-04-19", "Latte", 7, "X"),
      mkTx("2026-04-19", "Latte", 7, "X"),
      mkTx("2026-04-19", "Latte", 7, "X"),
    ];
    const out = assignDuplicateOrdinals(rows);
    const distinct = new Set(out.map((x) => x.hash));
    expect(distinct.size).toBe(3);
  });
});
