// Single home for currency-code handling. Currency codes are stored and
// compared in lowercase ISO 4217 form everywhere in the kit.

import { z } from "zod";

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
