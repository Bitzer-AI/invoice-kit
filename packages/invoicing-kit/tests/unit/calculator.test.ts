import { test, expect, describe } from "vitest";
import { DocumentCalculator } from "../../src/lib/calculator";

describe("DocumentCalculator", () => {
  const calc = new DocumentCalculator();

  test("computes line item total: quantity × price + taxAmount", () => {
    const line = calc.lineTotal({ quantity: "2.5", price: 1000n, taxAmount: 250n });
    // 2.5 × 1000 = 2500, + 250 tax = 2750
    expect(line.total).toBe(2750n);
    expect(line.subtotal).toBe(2500n);
  });

  test("rounds line subtotal to nearest minor unit (banker's rounding NOT required — just floor for v0)", () => {
    // quantity 1.5 × price 333 = 499.5 -> truncate or round? For v0 we floor.
    const line = calc.lineTotal({ quantity: "1.5", price: 333n, taxAmount: 0n });
    expect(line.subtotal).toBe(499n);
    expect(line.total).toBe(499n);
  });

  test("computes document totals: sum of line subtotals + sum of line tax amounts", () => {
    const totals = calc.documentTotals([
      { subtotal: 1000n, taxAmount: 100n, total: 1100n },
      { subtotal: 2000n, taxAmount: 200n, total: 2200n },
    ]);
    expect(totals.subtotal).toBe(3000n);
    expect(totals.tax).toBe(300n);
    expect(totals.total).toBe(3300n);
  });

  test("documentTotals on empty line items returns zeros", () => {
    const totals = calc.documentTotals([]);
    expect(totals.subtotal).toBe(0n);
    expect(totals.tax).toBe(0n);
    expect(totals.total).toBe(0n);
  });
});
