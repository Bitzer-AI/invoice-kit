import type { MoneyPolicy } from "../../types";
import { BaseTaxMethod, RoundingMode, TaxLevel } from "../../types";

/** Pre-0.17 behavior: truncated line subtotals and per-line truncated tax. Lossy; kept for compatibility. */
export const LEGACY_MONEY_POLICY: MoneyPolicy = Object.freeze({
  rounding: RoundingMode.Truncate,
  taxLevel: TaxLevel.Line,
  baseTaxMethod: BaseTaxMethod.Recompute,
});

/** Half-up rounding, tax once per rate on the document total, base tax recomputed in the base currency. */
export const RECOMMENDED_MONEY_POLICY: MoneyPolicy = Object.freeze({
  rounding: RoundingMode.HalfUp,
  taxLevel: TaxLevel.Document,
  baseTaxMethod: BaseTaxMethod.Recompute,
});

function isMember<T extends Record<string, string>>(
  values: T,
  candidate: unknown,
): candidate is T[keyof T] {
  return typeof candidate === "string" && (Object.values(values) as string[]).includes(candidate);
}

/** Reads a stored policy (JSON). Null when absent or malformed. */
export function parseMoneyPolicy(value: unknown): MoneyPolicy | null {
  if (typeof value !== "object" || value === null) return null;
  const { rounding, taxLevel, baseTaxMethod } = value as Record<string, unknown>;
  if (
    !isMember(RoundingMode, rounding) ||
    !isMember(TaxLevel, taxLevel) ||
    !isMember(BaseTaxMethod, baseTaxMethod)
  ) {
    return null;
  }
  return { rounding, taxLevel, baseTaxMethod };
}
