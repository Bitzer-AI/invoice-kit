import { describe, expect, test } from "vitest";
import { currencyMinorUnitDigits } from "../../src/lib/currency";
import { minorUnitsToDecimalString } from "../../src/lib/line-item";

describe("currencyMinorUnitDigits", () => {
  test.each([
    ["usd", 2],
    ["dop", 2],
    ["eur", 2],
    ["mxn", 2],
    ["cop", 2],
    ["clp", 0],
    ["jpy", 0],
    ["kwd", 3],
    ["bhd", 3],
  ])("%s has %i minor unit digits", (currency, digits) => {
    expect(currencyMinorUnitDigits(currency)).toBe(digits);
  });

  test("the code is read in any case", () => {
    expect(currencyMinorUnitDigits("JPY")).toBe(0);
    expect(currencyMinorUnitDigits("Kwd")).toBe(3);
  });

  test("a text that is no currency code is refused", () => {
    expect(() => currencyMinorUnitDigits("12")).toThrow(RangeError);
    expect(() => currencyMinorUnitDigits("")).toThrow(RangeError);
  });
});

describe("minorUnitsToDecimalString", () => {
  test.each([
    [5000n, "usd", "50.00"],
    [5n, "usd", "0.05"],
    [0n, "usd", "0.00"],
    [1500n, "jpy", "1500"],
    [0n, "clp", "0"],
    [1500n, "kwd", "1.500"],
    [5n, "kwd", "0.005"],
    [150_000_000_00n, "cop", "150000000.00"],
    [-5000n, "usd", "-50.00"],
    [-1500n, "jpy", "-1500"],
    [-5n, "kwd", "-0.005"],
  ])("%s minor units of %s read %s", (minor, currency, expected) => {
    expect(minorUnitsToDecimalString(minor, currency)).toBe(expected);
  });
});
