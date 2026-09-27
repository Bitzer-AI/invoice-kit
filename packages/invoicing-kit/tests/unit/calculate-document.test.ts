import { describe, expect, test } from "vitest";
import { BaseTaxMethod, RoundingMode, TaxLevel, TaxType } from "../../src/types";
import type { MoneyPolicy } from "../../src/types";
import {
  LEGACY_MONEY_POLICY,
  RECOMMENDED_MONEY_POLICY,
  calculateDocument,
  type TaxDefinition,
  parseScaled,
  roundDiv,
} from "../../src/lib/money";

const itbis18: TaxDefinition = { id: "itbis", type: TaxType.Percentage, rate: "0.18" };
const vat21: TaxDefinition = { id: "vat", type: TaxType.Percentage, rate: "0.2100" };
const fee50: TaxDefinition = { id: "fee", type: TaxType.Fixed, rate: "50" };

describe("legacy policy reproduces pre-0.17 math", () => {
  test("truncated subtotal and per-line truncated tax", () => {
    const result = calculateDocument({
      policy: LEGACY_MONEY_POLICY,
      lines: [
        { quantity: "2.5", price: 1000n, taxes: [] },
        { quantity: "1.5", price: 333n, taxes: [] },
        { quantity: "1", price: 10000n, taxes: [vat21] },
        { quantity: "3", price: 1000n, taxes: [fee50] },
      ],
    });
    expect(result.lines.map((line) => line.subtotal)).toEqual([2500n, 499n, 10000n, 3000n]);
    expect(result.lines.map((line) => line.taxAmount)).toEqual([0n, 0n, 2100n, 150n]);
    expect(result.subtotal).toBe(15999n);
    expect(result.tax).toBe(2250n);
    expect(result.total).toBe(18249n);
    expect(result.base).toBeNull();
  });

  test("fractional FIXED rate is kept, not truncated (0.17.0 bug fix)", () => {
    const result = calculateDocument({
      policy: LEGACY_MONEY_POLICY,
      lines: [{ quantity: "2", price: 1000n, taxes: [{ id: "fee", type: TaxType.Fixed, rate: "50.5" }] }],
    });
    expect(result.lines[0]!.taxAmount).toBe(101n);
  });
});

describe("recommended policy", () => {
  test("half-up line subtotal: 1.5 × 3.33 = 5.00", () => {
    const result = calculateDocument({
      policy: RECOMMENDED_MONEY_POLICY,
      lines: [{ quantity: "1.5", price: 333n, taxes: [] }],
    });
    expect(result.subtotal).toBe(500n);
  });

  test("document-level tax is one rounding per tax, allocated back exactly", () => {
    const lines = [1003n, 1003n, 1003n].map((price) => ({ quantity: "1", price, taxes: [itbis18] }));
    const documentLevel = calculateDocument({ policy: RECOMMENDED_MONEY_POLICY, lines });
    expect(documentLevel.tax).toBe(542n); // round(3009 × 18%) = round(541.62)
    expect(documentLevel.lines.map((line) => line.taxAmount)).toEqual([181n, 181n, 180n]);
    expect(documentLevel.taxTotals).toEqual([{ taxId: "itbis", amount: 542n, baseAmount: null }]);

    const lineLevel = calculateDocument({
      policy: { ...RECOMMENDED_MONEY_POLICY, taxLevel: TaxLevel.Line },
      lines,
    });
    expect(lineLevel.tax).toBe(543n); // 3 × round(180.54)
  });

  test("zero-price lines with a percentage tax stay zero", () => {
    const result = calculateDocument({
      policy: RECOMMENDED_MONEY_POLICY,
      lines: [
        { quantity: "1", price: 0n, taxes: [itbis18] },
        { quantity: "2", price: 0n, taxes: [itbis18] },
      ],
      exchangeRate: "59.347",
    });
    expect(result.total).toBe(0n);
    expect(result.base).toEqual({ subtotal: 0n, tax: 0n, total: 0n });
  });
});

describe("base currency", () => {
  test("USD 1,000 + 18% at 59.3470 → RD$59,347.00 + 10,682.46 = 70,029.46", () => {
    const result = calculateDocument({
      policy: RECOMMENDED_MONEY_POLICY,
      lines: [{ quantity: "1", price: 100_000n, taxes: [itbis18] }],
      exchangeRate: "59.3470",
    });
    expect(result.total).toBe(118_000n);
    expect(result.base).toEqual({ subtotal: 5_934_700n, tax: 1_068_246n, total: 7_002_946n });
    expect(result.lines[0]!.baseSubtotal).toBe(5_934_700n);
    expect(result.lines[0]!.taxes[0]!.baseTaxAmount).toBe(1_068_246n);
  });

  test("recompute and convert differ exactly where the spec says", () => {
    const input = {
      lines: [{ quantity: "1", price: 1005n, taxes: [itbis18] }],
      exchangeRate: "58.5",
    };
    const recompute = calculateDocument({ ...input, policy: RECOMMENDED_MONEY_POLICY });
    const convert = calculateDocument({
      ...input,
      policy: { ...RECOMMENDED_MONEY_POLICY, baseTaxMethod: BaseTaxMethod.Convert },
    });
    expect(recompute.base!.subtotal).toBe(58_793n); // round(1005 × 58.5)
    expect(recompute.base!.tax).toBe(10_583n); // round(58793 × 18%)
    expect(convert.base!.tax).toBe(10_589n); // round(181 × 58.5)
  });

  test("fixed taxes are converted, never recomputed", () => {
    const result = calculateDocument({
      policy: RECOMMENDED_MONEY_POLICY,
      lines: [{ quantity: "3", price: 1000n, taxes: [fee50] }],
      exchangeRate: "2",
    });
    expect(result.lines[0]!.taxes[0]!.baseTaxAmount).toBe(300n);
  });

  test("identity rate returns the document amounts and keeps taxes equal", () => {
    const result = calculateDocument({
      policy: RECOMMENDED_MONEY_POLICY,
      lines: [
        { quantity: "1.5", price: 333n, taxes: [itbis18] },
        { quantity: "2", price: 1000n, taxes: [fee50] },
        { quantity: "1", price: 2500n, taxes: [itbis18] },
      ],
      exchangeRate: "1",
    });
    expect(result.base).toEqual({ subtotal: result.subtotal, tax: result.tax, total: result.total });
    for (const line of result.lines) {
      expect(line.baseSubtotal).toBe(line.subtotal);
      for (const tax of line.taxes) {
        expect(tax.baseTaxAmount).toBe(tax.taxAmount);
      }
    }
  });

  test("rejects a non-positive rate", () => {
    expect(() =>
      calculateDocument({ policy: RECOMMENDED_MONEY_POLICY, lines: [], exchangeRate: "0" }),
    ).toThrow(RangeError);
  });
});

describe("percentage tax oracle regression test", () => {
  test("line-level percentage tax oracle catches corrupted allocation", () => {
    const policy = { rounding: RoundingMode.HalfUp, taxLevel: TaxLevel.Line, baseTaxMethod: BaseTaxMethod.Recompute };
    const result = calculateDocument({
      policy,
      lines: [
        { quantity: "1", price: 1003n, taxes: [itbis18] },
        { quantity: "1", price: 2007n, taxes: [itbis18] },
      ],
    });
    // 1003 * 0.18 = 180.54 → 181, 2007 * 0.18 = 361.26 → 361
    expect(result.lines[0]!.taxes[0]!.taxAmount).toBe(181n);
    expect(result.lines[1]!.taxes[0]!.taxAmount).toBe(361n);
  });
});

describe("sign validation", () => {
  test("mixed-sign line subtotals throw RangeError", () => {
    expect(() =>
      calculateDocument({
        policy: RECOMMENDED_MONEY_POLICY,
        lines: [
          { quantity: "1", price: 1000n, taxes: [] },
          { quantity: "1", price: -400n, taxes: [] },
        ],
      }),
    ).toThrow(RangeError);
  });

  test("all-negative document mirrors positive one exactly", () => {
    const positiveLines = [1003n, 1003n, 1003n].map((price) => ({ quantity: "1", price, taxes: [itbis18] }));
    const positive = calculateDocument({
      policy: RECOMMENDED_MONEY_POLICY,
      lines: positiveLines,
      exchangeRate: "59.347",
    });

    const negativeLines = [1003n, 1003n, 1003n].map((price) => ({ quantity: "1", price: -price, taxes: [itbis18] }));
    const negative = calculateDocument({
      policy: RECOMMENDED_MONEY_POLICY,
      lines: negativeLines,
      exchangeRate: "59.347",
    });

    // Document totals are negated
    expect(negative.subtotal).toBe(-positive.subtotal);
    expect(negative.tax).toBe(-positive.tax);
    expect(negative.total).toBe(-positive.total);

    // Line amounts are negated
    for (let i = 0; i < positive.lines.length; i++) {
      expect(negative.lines[i]!.subtotal).toBe(-positive.lines[i]!.subtotal);
      expect(negative.lines[i]!.taxAmount).toBe(-positive.lines[i]!.taxAmount);
      expect(negative.lines[i]!.total).toBe(-positive.lines[i]!.total);
      expect(negative.lines[i]!.baseSubtotal).toBe(-positive.lines[i]!.baseSubtotal!);
      for (let j = 0; j < positive.lines[i]!.taxes.length; j++) {
        expect(negative.lines[i]!.taxes[j]!.taxAmount).toBe(-positive.lines[i]!.taxes[j]!.taxAmount);
        expect(negative.lines[i]!.taxes[j]!.baseTaxAmount).toBe(-positive.lines[i]!.taxes[j]!.baseTaxAmount!);
      }
    }

    // Base totals are negated
    expect(negative.base!.subtotal).toBe(-positive.base!.subtotal);
    expect(negative.base!.tax).toBe(-positive.base!.tax);
    expect(negative.base!.total).toBe(-positive.base!.total);
  });
});

describe("oracle-verified invariants (seeded random documents)", () => {
  function mulberry32(seed: number) {
    return () => {
      seed |= 0;
      seed = (seed + 0x6d2b79f5) | 0;
      let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  const random = mulberry32(20260925);
  const pick = <T>(values: readonly T[]) => values[Math.floor(random() * values.length)]!;
  const policies: MoneyPolicy[] = [];
  for (const rounding of Object.values(RoundingMode))
    for (const taxLevel of Object.values(TaxLevel))
      for (const baseTaxMethod of Object.values(BaseTaxMethod))
        policies.push({ rounding, taxLevel, baseTaxMethod });
  const taxPool = [itbis18, { id: "t16", type: TaxType.Percentage, rate: "0.16" }, fee50];
  const sum = (values: bigint[]) => values.reduce((a, b) => a + b, 0n);
  const abs = (v: bigint) => (v < 0n ? -v : v);

  test("independent oracle checks for every policy and exchange rate combination", () => {
    for (let run = 0; run < 1500; run++) {
      // Generate lines: ~25% all-negative, rest mixed with larger BigInts
      const numLines = 1 + Math.floor(random() * 7);
      const allNegative = random() < 0.25;
      const useLargePrice = random() < 0.5;

      const lines = Array.from({ length: numLines }, () => {
        let price: bigint;
        if (useLargePrice) {
          price = BigInt(Math.floor(random() * 1e9)) * 1_000_000n + BigInt(Math.floor(random() * 1e6));
        } else {
          price = BigInt(Math.floor(random() * 1_000_000_000));
        }
        if (allNegative) price = -price;

        return {
          quantity: `${Math.floor(random() * 20)}.${String(Math.floor(random() * 10_000)).padStart(4, "0")}`,
          price,
          taxes: taxPool.filter(() => random() < 0.5),
        };
      });

      const exchangeRate = random() < 0.3 ? null : `${Math.floor(random() * 200)}.${String(Math.floor(random() * 1e8)).padStart(8, "0")}`;
      const policy = pick(policies);
      if (exchangeRate === "0.00000000") continue;

      const result = calculateDocument({ lines, policy, exchangeRate });

      // ORACLE CHECKS

      // (a) Each line subtotal: roundDiv(parseScaled(qty, 4) * price, 10_000n, policy.rounding)
      for (let i = 0; i < lines.length; i++) {
        const expected = roundDiv(parseScaled(lines[i]!.quantity, 4) * lines[i]!.price, 10_000n, policy.rounding);
        expect(result.lines[i]!.subtotal).toBe(expected);
      }

      // (b) FIXED tax: roundDiv(parseScaled(rate, 4) * parseScaled(qty, 4), 100_000_000n, policy.rounding)
      for (let i = 0; i < lines.length; i++) {
        for (const taxDef of lines[i]!.taxes) {
          if (taxDef.type === TaxType.Fixed) {
            const rate = parseScaled(taxDef.rate, 4);
            const qty = parseScaled(lines[i]!.quantity, 4);
            const expected = roundDiv(rate * qty, 100_000_000n, policy.rounding);
            expect(result.lines[i]!.taxes.find(t => t.taxId === taxDef.id)!.taxAmount).toBe(expected);
          }
        }
      }

      // (c) PERCENTAGE tax: line-level or document-level oracle
      for (const taxDef of taxPool) {
        if (taxDef.type === TaxType.Percentage) {
          const rate4 = parseScaled(taxDef.rate, 4);
          const carrying = result.lines.map((l, i) => ({ line: l, idx: i })).filter(({ line }) => line.taxes.some(t => t.taxId === taxDef.id));
          if (carrying.length === 0) continue;

          if (policy.taxLevel === TaxLevel.Line) {
            // Line-level: each carrying line's tax === roundDiv(lineSubtotal * rate4, 10_000n, policy.rounding)
            for (const { line, idx } of carrying) {
              const expectedLineTax = roundDiv(result.lines[idx]!.subtotal * rate4, 10_000n, policy.rounding);
              const actualLineTax = line.taxes.find(t => t.taxId === taxDef.id)!.taxAmount;
              expect(actualLineTax).toBe(expectedLineTax);
            }
          } else {
            // Document-level: Σ tax for this id === roundDiv(Σ subtotals of carrying * rate4, 10_000n, policy.rounding)
            const carryingSubtotals = carrying.map(({ idx }) => result.lines[idx]!.subtotal);
            const expectedDocTax = roundDiv(sum(carryingSubtotals) * rate4, 10_000n, policy.rounding);
            const actualDocTax = sum(carrying.map(({ line }) => line.taxes.find(t => t.taxId === taxDef.id)!.taxAmount));
            expect(actualDocTax).toBe(expectedDocTax);
          }
        }
      }

      // (d) Base currency: Σ baseSubtotal === roundDiv(documentSubtotal * r, 100_000_000n, HalfUp)
      if (exchangeRate != null) {
        const rate = parseScaled(exchangeRate, 8);
        const expectedBaseSubtotal = roundDiv(result.subtotal * rate, 100_000_000n, RoundingMode.HalfUp);
        const actualBaseSubtotal = sum(result.lines.map(l => l.baseSubtotal!));
        expect(actualBaseSubtotal).toBe(expectedBaseSubtotal);

        // (e) Base tax per tax id: verify conversion math
        for (const taxDef of taxPool) {
          const lines_with_tax = result.lines.map((l, i) => ({ line: l, idx: i })).filter(({ line }) => line.taxes.some(t => t.taxId === taxDef.id));
          if (lines_with_tax.length === 0) continue;

          const taxTotal = result.taxTotals.find(t => t.taxId === taxDef.id);
          if (!taxTotal) continue;

          if (taxDef.type === TaxType.Fixed) {
            // Fixed: always convert — Σ baseTaxAmount === roundDiv(taxTotalOfThatId * r, 100_000_000n, HalfUp)
            const expectedBaseTax = roundDiv(taxTotal.amount * rate, 100_000_000n, RoundingMode.HalfUp);
            expect(taxTotal.baseAmount).toBe(expectedBaseTax);
          } else if (taxDef.type === TaxType.Percentage) {
            const rate4 = parseScaled(taxDef.rate, 4);
            if (policy.baseTaxMethod === BaseTaxMethod.Convert) {
              // Convert: Σ baseTaxAmount === roundDiv(taxTotalOfThatId * r, 100_000_000n, HalfUp)
              const expectedBaseTax = roundDiv(taxTotal.amount * rate, 100_000_000n, RoundingMode.HalfUp);
              expect(taxTotal.baseAmount).toBe(expectedBaseTax);
            } else if (policy.baseTaxMethod === BaseTaxMethod.Recompute) {
              // Recompute: re-run tax rules on base subtotals
              if (policy.taxLevel === TaxLevel.Line) {
                // Line-level: each line's base tax === roundDiv(lineBaseSubtotal * rate4, 10_000n, policy.rounding)
                for (const { line, idx } of lines_with_tax) {
                  const expectedBaseLineTax = roundDiv(result.lines[idx]!.baseSubtotal! * rate4, 10_000n, policy.rounding);
                  const actualBaseLineTax = line.taxes.find(t => t.taxId === taxDef.id)!.baseTaxAmount!;
                  expect(actualBaseLineTax).toBe(expectedBaseLineTax);
                }
              } else {
                // Document-level: Σ baseTaxAmount === roundDiv(Σ baseSubtotal of carrying * rate4, 10_000n, policy.rounding)
                const carryingBaseSubtotals = lines_with_tax.map(({ idx }) => result.lines[idx]!.baseSubtotal!);
                const expectedDocBaseTax = roundDiv(sum(carryingBaseSubtotals) * rate4, 10_000n, policy.rounding);
                const actualDocBaseTax = sum(lines_with_tax.map(({ line }) => line.taxes.find(t => t.taxId === taxDef.id)!.baseTaxAmount!));
                expect(actualDocBaseTax).toBe(expectedDocBaseTax);
              }
            }
          }
        }
      }

      // Allocation fairness: for allocated amounts, |p_i * W - T * w_i| < W
      // Check document-level percentage taxes
      if (policy.taxLevel === TaxLevel.Document) {
        for (const taxDef of taxPool) {
          if (taxDef.type === TaxType.Percentage) {
            const lines_carrying_tax = result.lines.filter(l => l.taxes.some(t => t.taxId === taxDef.id));
            if (lines_carrying_tax.length <= 1) continue;
            const W = sum(lines_carrying_tax.map(l => l.subtotal));
            if (W === 0n) continue;
            const weights = lines_carrying_tax.map(l => l.subtotal);
            const allocated = lines_carrying_tax.map(l => l.taxes.find(t => t.taxId === taxDef.id)!.taxAmount);
            for (let i = 0; i < allocated.length; i++) {
              expect(abs(allocated[i]! * W - allocated.reduce((a, b) => a + b, 0n) * weights[i]!)).toBeLessThan(abs(W));
            }
          }
        }
      }

      // Check base subtotal allocation fairness
      if (exchangeRate != null) {
        const rate = parseScaled(exchangeRate, 8);
        const W = sum(result.lines.map(l => l.subtotal));
        if (W !== 0n) {
          const weights = result.lines.map(l => l.subtotal);
          const allocated = result.lines.map(l => l.baseSubtotal!);
          for (let i = 0; i < allocated.length; i++) {
            expect(abs(allocated[i]! * W - result.base!.subtotal * weights[i]!)).toBeLessThan(abs(W));
          }
        }
      }

      // Structural checks (keep existing invariants)
      expect(sum(result.lines.map((line) => line.subtotal))).toBe(result.subtotal);
      expect(sum(result.lines.map((line) => line.taxAmount))).toBe(result.tax);
      expect(result.subtotal + result.tax).toBe(result.total);
      for (const line of result.lines) expect(line.subtotal + line.taxAmount).toBe(line.total);
      for (const total of result.taxTotals) {
        const perLine = result.lines.flatMap((line) => line.taxes.filter((t) => t.taxId === total.taxId));
        expect(sum(perLine.map((t) => t.taxAmount))).toBe(total.amount);
      }
      if (result.base) {
        expect(sum(result.lines.map((line) => line.baseSubtotal!))).toBe(result.base.subtotal);
        expect(sum(result.lines.flatMap((line) => line.taxes.map((t) => t.baseTaxAmount!)))).toBe(result.base.tax);
        expect(result.base.subtotal + result.base.tax).toBe(result.base.total);
      }
    }
  });
});

describe("an invalid policy is rejected, never computed as something else", () => {
  test("an unknown tax level throws", () => {
    const policy = { ...RECOMMENDED_MONEY_POLICY, taxLevel: "Document" } as unknown as MoneyPolicy;
    expect(() =>
      calculateDocument({ policy, lines: [{ quantity: "1", price: 10000n, taxes: [itbis18] }] }),
    ).toThrow(RangeError);
  });

  test("an unknown base tax method throws", () => {
    const policy = { ...RECOMMENDED_MONEY_POLICY, baseTaxMethod: "Convert" } as unknown as MoneyPolicy;
    expect(() =>
      calculateDocument({ policy, exchangeRate: "59.347", lines: [{ quantity: "1", price: 10000n, taxes: [itbis18] }] }),
    ).toThrow(RangeError);
  });
});
