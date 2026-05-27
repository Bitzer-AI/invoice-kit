import { test, expect, describe } from "vitest";
import { inMemoryAdapter } from "../../src/adapters/memory";
import { TaxStrategy } from "../../src/lib/tax-strategy";

describe("TaxStrategy", () => {
  test("PERCENTAGE tax: amount = subtotal × rate (rounded down)", async () => {
    const repos = inMemoryAdapter();
    const tax = await repos.taxes.create({
      organizationId: "org-1",
      name: "VAT",
      type: "PERCENTAGE",
      rate: "0.2100", // 21%
    });
    const strategy = new TaxStrategy();
    const result = await strategy.computeForLine(repos, "org-1", {
      quantity: "1",
      price: 10000n, // $100.00
      taxIds: [tax.id],
    });
    // 100.00 × 0.21 = 21.00 = 2100 cents
    expect(result.taxAmount).toBe(2100n);
    expect(result.perTax).toEqual([{ taxId: tax.id, taxAmount: 2100n }]);
  });

  test("FIXED tax: amount = rate × quantity (rate in minor units)", async () => {
    const repos = inMemoryAdapter();
    const tax = await repos.taxes.create({
      organizationId: "org-1",
      name: "Per-unit fee",
      type: "FIXED",
      rate: "50", // $0.50 in minor units = 50 cents
    });
    const strategy = new TaxStrategy();
    const result = await strategy.computeForLine(repos, "org-1", {
      quantity: "3",
      price: 1000n,
      taxIds: [tax.id],
    });
    // 50 × 3 = 150
    expect(result.taxAmount).toBe(150n);
  });

  test("multiple taxes: sum of each", async () => {
    const repos = inMemoryAdapter();
    const a = await repos.taxes.create({
      organizationId: "org-1",
      name: "A",
      type: "PERCENTAGE",
      rate: "0.10",
    });
    const b = await repos.taxes.create({
      organizationId: "org-1",
      name: "B",
      type: "PERCENTAGE",
      rate: "0.05",
    });
    const strategy = new TaxStrategy();
    const result = await strategy.computeForLine(repos, "org-1", {
      quantity: "1",
      price: 10000n,
      taxIds: [a.id, b.id],
    });
    // A: 1000, B: 500 -> total 1500
    expect(result.taxAmount).toBe(1500n);
    expect(result.perTax).toHaveLength(2);
  });

  test("empty taxIds: returns zero tax and empty array", async () => {
    const repos = inMemoryAdapter();
    const strategy = new TaxStrategy();
    const result = await strategy.computeForLine(repos, "org-1", {
      quantity: "1",
      price: 10000n,
      taxIds: [],
    });
    expect(result.taxAmount).toBe(0n);
    expect(result.perTax).toEqual([]);
  });
});
