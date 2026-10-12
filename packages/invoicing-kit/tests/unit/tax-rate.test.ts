import { describe, expect, test } from "vitest";
import { createTaxBody, updateTaxBody } from "../../src/domains/taxes/validation";
import { calculateDocument, LEGACY_MONEY_POLICY, RECOMMENDED_MONEY_POLICY } from "../../src/lib/money";
import { TAX_RATE_PRECISION, TAX_RATE_SCALE, atScale, fitsScale, formatScaled } from "../../src/lib/money/decimal";
import { TaxType } from "../../src/types";

const percentage = (rate: string) => createTaxBody.safeParse({ name: "Sales tax", type: TaxType.Percentage, rate });
const fixed = (rate: string) => createTaxBody.safeParse({ name: "Stamp", type: TaxType.Fixed, rate });

describe("tax rate contract", () => {
  test("a rate holds six decimals", () => {
    expect(TAX_RATE_SCALE).toBe(6);
  });

  test.each(["0.18", "0.1800", "0.08875", "0.09975", "0.000001", "0"])("the percentage rate %s is accepted", (rate) => {
    expect(percentage(rate).success).toBe(true);
  });

  test.each(["0.0887501", "0.1234567", "1", "18", ".18", "0.", "-0.18", "0,18", "abc", ""])(
    "the percentage rate %s is refused",
    (rate) => {
      expect(percentage(rate).success).toBe(false);
    },
  );

  test("a fixed rate is minor units and fits the integer digits of the column", () => {
    const integerDigits = TAX_RATE_PRECISION - TAX_RATE_SCALE;
    expect(integerDigits).toBe(13);
    expect(fixed("50").success).toBe(true);
    expect(fixed("5000000").success).toBe(true);
    expect(fixed("50.5").success).toBe(true);
    expect(fixed("9".repeat(integerDigits)).success).toBe(true);
    expect(fixed("9".repeat(integerDigits + 1)).success).toBe(false);
  });

  test("an update refuses a seventh decimal as a create does", () => {
    expect(updateTaxBody.safeParse({ rate: "0.08875" }).success).toBe(true);
    expect(updateTaxBody.safeParse({ rate: "0.0887501" }).success).toBe(false);
  });
});

describe("fiscal category is free text", () => {
  const withCategory = (fiscalCategory: unknown) =>
    createTaxBody.safeParse({ name: "IVA", type: TaxType.Percentage, rate: "0.16", fiscalCategory });

  test("any text of 1 to 40 characters is accepted and trimmed", () => {
    expect(withCategory("IVA16").success).toBe(true);
    expect(withCategory("S").success).toBe(true);
    expect(withCategory("x".repeat(40)).success).toBe(true);
    expect(withCategory("  standard  ")).toMatchObject({ success: true, data: { fiscalCategory: "standard" } });
  });

  test("null and an absent value are accepted", () => {
    expect(withCategory(null)).toMatchObject({ success: true, data: { fiscalCategory: null } });
    expect(withCategory(undefined).success).toBe(true);
  });

  test("an empty text, a blank text and 41 characters are refused", () => {
    expect(withCategory("").success).toBe(false);
    expect(withCategory("   ").success).toBe(false);
    expect(withCategory("x".repeat(41)).success).toBe(false);
  });
});

describe("a six-decimal rate in a calculation", () => {
  const taxOn = (price: bigint, rate: string, policy = RECOMMENDED_MONEY_POLICY) =>
    calculateDocument({
      policy,
      lines: [{ quantity: "1", price, taxes: [{ id: "tax", type: TaxType.Percentage, rate }] }],
    }).tax;

  test("8.875 % and 9.975 % are exact on a round amount", () => {
    expect(taxOn(100_000n, "0.08875")).toBe(8_875n);
    expect(taxOn(100_000n, "0.09975")).toBe(9_975n);
  });

  test("the fifth and sixth decimals change the rounded tax", () => {
    expect(taxOn(1_000_000n, "0.0887")).toBe(88_700n);
    expect(taxOn(1_000_000n, "0.08875")).toBe(88_750n);
    expect(taxOn(1_000_000n, "0.088755")).toBe(88_755n);
  });

  test("the policy rounds the fraction of a minor unit", () => {
    expect(taxOn(333n, "0.08875", RECOMMENDED_MONEY_POLICY)).toBe(30n);
    expect(taxOn(333n, "0.08875", LEGACY_MONEY_POLICY)).toBe(29n);
  });

  test("a rate written with four decimals gives the amount it gave before", () => {
    expect(taxOn(100_000n, "0.1800")).toBe(18_000n);
    expect(taxOn(100_000n, "0.180000")).toBe(18_000n);
    expect(taxOn(999n, "0.1800", LEGACY_MONEY_POLICY)).toBe(179n);
  });

  test("a fixed rate is an amount per unit of quantity", () => {
    const result = calculateDocument({
      policy: RECOMMENDED_MONEY_POLICY,
      lines: [{ quantity: "2.5", price: 1_000n, taxes: [{ id: "stamp", type: TaxType.Fixed, rate: "50" }] }],
    });
    expect(result.tax).toBe(125n);
  });

  test("a fixed rate with decimals is a fraction of a minor unit per unit of quantity", () => {
    const result = calculateDocument({
      policy: RECOMMENDED_MONEY_POLICY,
      lines: [{ quantity: "3", price: 1_000n, taxes: [{ id: "stamp", type: TaxType.Fixed, rate: "0.5" }] }],
    });
    expect(result.tax).toBe(2n);
  });

  test("a seventh decimal is refused", () => {
    expect(() => taxOn(100_000n, "0.0887501")).toThrow(RangeError);
  });
});

describe("decimal text at a scale", () => {
  test("formatScaled prints every digit of the scale", () => {
    expect(formatScaled(180_000n, 6)).toBe("0.180000");
    expect(formatScaled(88_750n, 6)).toBe("0.088750");
    expect(formatScaled(1500n, 0)).toBe("1500");
    expect(formatScaled(-5n, 3)).toBe("-0.005");
  });

  test("atScale keeps the value and pads the decimals", () => {
    expect(atScale("0.1800", 6)).toBe("0.180000");
    expect(atScale("0.08875", 6)).toBe("0.088750");
    expect(atScale("50", 6)).toBe("50.000000");
    expect(atScale("1500.00", 0)).toBe("1500");
  });

  test("fitsScale accepts trailing zeros beyond the scale and refuses a digit", () => {
    expect(fitsScale("1500", 0)).toBe(true);
    expect(fitsScale("1500.00", 0)).toBe(true);
    expect(fitsScale("1500.5", 0)).toBe(false);
    expect(fitsScale("1.500", 3)).toBe(true);
    expect(fitsScale("1.5001", 3)).toBe(false);
  });
});
