import { RoundingMode } from "../../types";

/** numerator ÷ denominator rounded to an integer under `mode`, by magnitude with the sign preserved. */
export function roundDiv(numerator: bigint, denominator: bigint, mode: RoundingMode): bigint {
  if (denominator <= 0n) throw new RangeError("denominator must be positive");
  const negative = numerator < 0n;
  const magnitude = negative ? -numerator : numerator;
  const quotient = magnitude / denominator;
  const twiceRemainder = (magnitude % denominator) * 2n;
  let roundUp: boolean;
  switch (mode) {
    case RoundingMode.Truncate:
      roundUp = false;
      break;
    case RoundingMode.HalfUp:
      roundUp = twiceRemainder >= denominator;
      break;
    case RoundingMode.HalfEven:
      roundUp = twiceRemainder > denominator || (twiceRemainder === denominator && quotient % 2n === 1n);
      break;
    default: {
      const unknown: never = mode;
      throw new RangeError(`Unknown rounding mode: ${JSON.stringify(unknown)}`);
    }
  }
  const rounded = roundUp ? quotient + 1n : quotient;
  return negative ? -rounded : rounded;
}
