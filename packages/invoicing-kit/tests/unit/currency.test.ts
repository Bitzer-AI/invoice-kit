import { describe, expect, test, vi } from "vitest";
import {
  DEFAULT_CURRENCY_MINOR_UNIT_DIGITS,
  NON_DEFAULT_CURRENCY_MINOR_UNIT_DIGITS,
  currencyMinorUnitDigits,
} from "../../src/lib/currency";
import { minorUnitsToDecimalString } from "../../src/lib/line-item";

describe("currencyMinorUnitDigits", () => {
  test.each([
    ["usd", 2],
    ["dop", 2],
    ["eur", 2],
    ["mxn", 2],
    ["cop", 2],
    ["crc", 2],
    ["idr", 2],
    ["pkr", 2],
    ["huf", 2],
    ["lbp", 2],
    ["bif", 0],
    ["clp", 0],
    ["djf", 0],
    ["gnf", 0],
    ["isk", 0],
    ["jpy", 0],
    ["kmf", 0],
    ["krw", 0],
    ["pyg", 0],
    ["rwf", 0],
    ["ugx", 0],
    ["uyi", 0],
    ["vnd", 0],
    ["vuv", 0],
    ["xaf", 0],
    ["xof", 0],
    ["xpf", 0],
    ["bhd", 3],
    ["iqd", 3],
    ["jod", 3],
    ["kwd", 3],
    ["lyd", 3],
    ["omr", 3],
    ["tnd", 3],
    ["clf", 4],
    ["uyw", 4],
  ])("%s has %i minor unit digits", (currency, digits) => {
    expect(currencyMinorUnitDigits(currency)).toBe(digits);
  });

  test("a code that ISO 4217 adds later has the default digits", () => {
    expect(currencyMinorUnitDigits("xcg")).toBe(DEFAULT_CURRENCY_MINOR_UNIT_DIGITS);
    expect(DEFAULT_CURRENCY_MINOR_UNIT_DIGITS).toBe(2);
  });

  test("the code is read in any case", () => {
    expect(currencyMinorUnitDigits("JPY")).toBe(0);
    expect(currencyMinorUnitDigits("Kwd")).toBe(3);
    expect(currencyMinorUnitDigits("COP")).toBe(2);
  });

  test("a text that is no currency code is refused", () => {
    expect(() => currencyMinorUnitDigits("12")).toThrow(RangeError);
    expect(() => currencyMinorUnitDigits("")).toThrow(RangeError);
    expect(() => currencyMinorUnitDigits("usdt")).toThrow(RangeError);
  });

  test("the exported table holds lower case codes and no code with the default digits", () => {
    const entries = Object.entries(NON_DEFAULT_CURRENCY_MINOR_UNIT_DIGITS);
    expect(entries).toHaveLength(26);
    for (const [code, digits] of entries) {
      expect(code).toMatch(/^[a-z]{3}$/);
      expect(digits).not.toBe(DEFAULT_CURRENCY_MINOR_UNIT_DIGITS);
      expect(currencyMinorUnitDigits(code)).toBe(digits);
    }
  });

  test("the exported table cannot be changed", () => {
    expect(Object.isFrozen(NON_DEFAULT_CURRENCY_MINOR_UNIT_DIGITS)).toBe(true);
  });

  test("the digits never come from the engine", () => {
    const engineNumberFormat = vi.spyOn(Intl, "NumberFormat");
    try {
      expect(currencyMinorUnitDigits("cop")).toBe(2);
      expect(currencyMinorUnitDigits("isk")).toBe(0);
      expect(engineNumberFormat).not.toHaveBeenCalled();
    } finally {
      engineNumberFormat.mockRestore();
    }
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
    [1500n, "isk", "1500"],
    [15000n, "clf", "1.5000"],
    [1500n, "iqd", "1.500"],
    [-5000n, "usd", "-50.00"],
    [-1500n, "jpy", "-1500"],
    [-5n, "kwd", "-0.005"],
  ])("%s minor units of %s read %s", (minor, currency, expected) => {
    expect(minorUnitsToDecimalString(minor, currency)).toBe(expected);
  });
});
