import { describe, expect, test } from "vitest";
import { BaseTaxMethod, RoundingMode, TaxLevel } from "../../src/types";
import { canonicalDecimal, parseScaled } from "../../src/lib/money/decimal";
import { roundDiv } from "../../src/lib/money/rounding";
import { allocate } from "../../src/lib/money/allocate";
import {
  LEGACY_MONEY_POLICY,
  RECOMMENDED_MONEY_POLICY,
  parseMoneyPolicy,
} from "../../src/lib/money/policy";

describe("roundDiv", () => {
  test("an unknown rounding mode throws instead of truncating", () => {
    expect(() => roundDiv(4995n, 10n, "halfUp" as RoundingMode)).toThrow(RangeError);
  });

  const cases: Array<[bigint, bigint, RoundingMode, bigint]> = [
    // HalfUp: positive exact, .5, and non-.5 cases
    [5000n, 10n, RoundingMode.HalfUp, 500n],
    [4995n, 10n, RoundingMode.HalfUp, 500n],
    [4994n, 10n, RoundingMode.HalfUp, 499n],
    // HalfUp: negative exact, .5, and non-.5 cases
    [-5000n, 10n, RoundingMode.HalfUp, -500n],
    [-4995n, 10n, RoundingMode.HalfUp, -500n],
    [-4996n, 10n, RoundingMode.HalfUp, -500n],
    // HalfEven: positive exact, .5 (even quotient), .5 (odd quotient), and non-.5 cases
    [5000n, 10n, RoundingMode.HalfEven, 500n],
    [4985n, 10n, RoundingMode.HalfEven, 498n],
    [4995n, 10n, RoundingMode.HalfEven, 500n],
    [4996n, 10n, RoundingMode.HalfEven, 500n],
    // HalfEven: negative exact, .5 (even quotient), .5 (odd quotient), and non-.5 cases
    [-5000n, 10n, RoundingMode.HalfEven, -500n],
    [-4985n, 10n, RoundingMode.HalfEven, -498n],
    [-4995n, 10n, RoundingMode.HalfEven, -500n],
    [-4996n, 10n, RoundingMode.HalfEven, -500n],
    // Truncate: positive exact, .5, and non-.5 cases
    [5000n, 10n, RoundingMode.Truncate, 500n],
    [4995n, 10n, RoundingMode.Truncate, 499n],
    [4996n, 10n, RoundingMode.Truncate, 499n],
    // Truncate: negative exact, .5, and non-.5 cases
    [-5000n, 10n, RoundingMode.Truncate, -500n],
    [-4995n, 10n, RoundingMode.Truncate, -499n],
    [-4996n, 10n, RoundingMode.Truncate, -499n],
  ];
  test.each(cases)("%s / %s under %s = %s", (numerator, denominator, mode, expected) => {
    expect(roundDiv(numerator, denominator, mode)).toBe(expected);
  });

  test("rejects a non-positive denominator", () => {
    expect(() => roundDiv(1n, 0n, RoundingMode.HalfUp)).toThrow(RangeError);
  });
});

describe("allocate", () => {
  test("parts always sum to the total, largest remainder first", () => {
    expect(allocate(542n, [1003n, 1003n, 1003n])).toEqual([181n, 181n, 180n]);
  });
  test("ties go to the earlier position", () => {
    expect(allocate(1n, [1n, 1n])).toEqual([1n, 0n]);
  });
  test("all-zero weights split evenly and still sum", () => {
    expect(allocate(5n, [0n, 0n])).toEqual([3n, 2n]);
    expect(allocate(0n, [0n, 0n, 0n])).toEqual([0n, 0n, 0n]);
  });
  test("negative totals mirror positive ones", () => {
    expect(allocate(-542n, [1003n, 1003n, 1003n])).toEqual([-181n, -181n, -180n]);
  });
  test("zero parts only accept a zero total", () => {
    expect(allocate(0n, [])).toEqual([]);
    expect(() => allocate(1n, [])).toThrow(RangeError);
  });
  test("single-weight array", () => {
    expect(allocate(542n, [1003n])).toEqual([542n]);
    expect(allocate(-7n, [0n])).toEqual([-7n]);
  });
  test("rejects weights that mix positive and negative", () => {
    expect(() => allocate(10n, [5n, -3n])).toThrow(RangeError);
  });
  test("all-negative weights work correctly", () => {
    expect(allocate(-10n, [-5n, -5n])).toEqual([-5n, -5n]);
  });
});

describe("decimal", () => {
  test("parseScaled pads and scales", () => {
    expect(parseScaled("59.347", 8)).toBe(5_934_700_000n);
    expect(parseScaled("1.5", 4)).toBe(15_000n);
    expect(parseScaled("0.18000000", 4)).toBe(1_800n);
    expect(parseScaled("-2", 4)).toBe(-20_000n);
  });
  test("parseScaled rejects non-zero digits beyond the scale", () => {
    expect(() => parseScaled("0.123456", 4)).toThrow(RangeError);
    expect(() => parseScaled("abc", 4)).toThrow(RangeError);
  });
  test("canonicalDecimal strips trailing and leading zeros", () => {
    expect(canonicalDecimal("59.34700000")).toBe("59.347");
    expect(canonicalDecimal("1.0")).toBe("1");
    expect(canonicalDecimal("007.50")).toBe("7.5");
    expect(canonicalDecimal("-0.00")).toBe("0");
  });
});

describe("policy", () => {
  test("presets", () => {
    expect(LEGACY_MONEY_POLICY).toEqual({
      rounding: RoundingMode.Truncate,
      taxLevel: TaxLevel.Line,
      baseTaxMethod: BaseTaxMethod.Recompute,
    });
    expect(RECOMMENDED_MONEY_POLICY).toEqual({
      rounding: RoundingMode.HalfUp,
      taxLevel: TaxLevel.Document,
      baseTaxMethod: BaseTaxMethod.Recompute,
    });
  });
  test("parseMoneyPolicy accepts valid JSON and rejects anything else", () => {
    expect(parseMoneyPolicy({ ...RECOMMENDED_MONEY_POLICY })).toEqual(RECOMMENDED_MONEY_POLICY);
    expect(parseMoneyPolicy(null)).toBeNull();
    expect(parseMoneyPolicy({ rounding: "ceil", taxLevel: "line", baseTaxMethod: "recompute" })).toBeNull();
  });
});
