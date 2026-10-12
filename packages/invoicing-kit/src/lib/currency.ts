// Single home for currency-code handling. Currency codes are stored and
// compared in lowercase ISO 4217 form everywhere in the kit.

import { z } from "zod";

/** Default currency (lowercase ISO 4217) applied when a request omits one. */
export const DEFAULT_CURRENCY = "usd";

/** Lowercase ISO 4217 form used for storage and comparison ("USD" -> "usd"). */
export function normalizeCurrency(currency: string): string {
  return currency.toLowerCase();
}

/** Request-body schema for a currency code: exactly 3 letters, normalized to lowercase. */
export const currencyCodeSchema = z
  .string()
  .length(3)
  .regex(/^[a-zA-Z]{3}$/, "ISO 4217 currency code")
  .transform(normalizeCurrency);

export const DEFAULT_CURRENCY_MINOR_UNIT_DIGITS = 2;

export const NON_DEFAULT_CURRENCY_MINOR_UNIT_DIGITS: Readonly<Record<string, number>> = Object.freeze({
  bif: 0,
  clp: 0,
  djf: 0,
  gnf: 0,
  isk: 0,
  jpy: 0,
  kmf: 0,
  krw: 0,
  pyg: 0,
  rwf: 0,
  ugx: 0,
  uyi: 0,
  vnd: 0,
  vuv: 0,
  xaf: 0,
  xof: 0,
  xpf: 0,
  bhd: 3,
  iqd: 3,
  jod: 3,
  kwd: 3,
  lyd: 3,
  omr: 3,
  tnd: 3,
  clf: 4,
  uyw: 4,
});

const NORMALIZED_CURRENCY_CODE_PATTERN = /^[a-z]{3}$/;

export function currencyMinorUnitDigits(currency: string): number {
  const code = normalizeCurrency(currency);
  if (!NORMALIZED_CURRENCY_CODE_PATTERN.test(code)) {
    throw new RangeError(`"${currency}" is not a three-letter currency code`);
  }
  return NON_DEFAULT_CURRENCY_MINOR_UNIT_DIGITS[code] ?? DEFAULT_CURRENCY_MINOR_UNIT_DIGITS;
}
