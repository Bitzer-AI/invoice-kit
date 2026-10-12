import type { DecimalString } from "../../types";

const DECIMAL_PATTERN = /^-?\d+(\.\d+)?$/;

/** Digits after the decimal point used by the money math. */
export const QUANTITY_SCALE = 4;
export const TAX_RATE_SCALE = 6;
export const EXCHANGE_RATE_SCALE = 8;

export const TAX_RATE_PRECISION = 19;

export function pow10(exponent: number): bigint {
  return 10n ** BigInt(exponent);
}

function splitDecimal(value: DecimalString) {
  const trimmed = value.trim();
  if (!DECIMAL_PATTERN.test(trimmed)) throw new RangeError(`Invalid decimal: "${value}"`);
  const negative = trimmed.startsWith("-");
  const [whole = "0", fraction = ""] = (negative ? trimmed.slice(1) : trimmed).split(".");
  return { negative, whole, fraction };
}

const hasDigitBeyondScale = (fraction: string, scale: number) => /[1-9]/.test(fraction.slice(scale));

export function fitsScale(value: DecimalString, scale: number): boolean {
  return !hasDigitBeyondScale(splitDecimal(value).fraction, scale);
}

/** "59.347" at scale 8 → 5934700000n. Throws when a non-zero digit falls beyond `scale`. */
export function parseScaled(value: DecimalString, scale: number): bigint {
  const { negative, whole, fraction } = splitDecimal(value);
  if (hasDigitBeyondScale(fraction, scale)) {
    throw new RangeError(`"${value}" has more than ${scale} decimal places`);
  }
  const scaled = BigInt(whole + fraction.slice(0, scale).padEnd(scale, "0"));
  return negative ? -scaled : scaled;
}

export function formatScaled(scaled: bigint, scale: number): DecimalString {
  const negative = scaled < 0n;
  const magnitude = negative ? -scaled : scaled;
  const factor = pow10(scale);
  const whole = (magnitude / factor).toString();
  const unsigned = scale === 0 ? whole : `${whole}.${(magnitude % factor).toString().padStart(scale, "0")}`;
  return negative ? `-${unsigned}` : unsigned;
}

export function atScale(value: DecimalString, scale: number): DecimalString {
  return formatScaled(parseScaled(value, scale), scale);
}

/** Canonical form: no leading zeros and no trailing fractional zeros ("059.34700000" → "59.347"). */
export function canonicalDecimal(value: DecimalString): DecimalString {
  const { negative, whole, fraction } = splitDecimal(value);
  const trimmedFraction = fraction.replace(/0+$/, "");
  const canonicalWhole = BigInt(whole).toString();
  const unsigned = trimmedFraction ? `${canonicalWhole}.${trimmedFraction}` : canonicalWhole;
  const isZero = canonicalWhole === "0" && trimmedFraction === "";
  return negative && !isZero ? `-${unsigned}` : unsigned;
}
