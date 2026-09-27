/**
 * Splits `total` into integer parts proportional to `weights` (largest remainder).
 * The parts always sum to `total`; ties go to the earlier position; all-zero
 * weights split evenly. Weights must not mix positive and negative values.
 */
export function allocate(total: bigint, weights: readonly bigint[]): bigint[] {
  if (weights.length === 0) {
    if (total !== 0n) throw new RangeError("cannot allocate a non-zero total across zero parts");
    return [];
  }
  const hasPositive = weights.some((w) => w > 0n);
  const hasNegative = weights.some((w) => w < 0n);
  if (hasPositive && hasNegative) {
    throw new RangeError("weights must not mix positive and negative values");
  }
  const negative = total < 0n;
  const magnitude = negative ? -total : total;
  const absolute = weights.map((weight) => (weight < 0n ? -weight : weight));
  const weightSum = absolute.reduce((sum, weight) => sum + weight, 0n);
  const effective = weightSum === 0n ? absolute.map(() => 1n) : absolute;
  const effectiveSum = weightSum === 0n ? BigInt(weights.length) : weightSum;

  const parts = effective.map((weight) => (magnitude * weight) / effectiveSum);
  const byRemainder = effective
    .map((weight, index) => ({ index, remainder: (magnitude * weight) % effectiveSum }))
    .sort((a, b) =>
      a.remainder === b.remainder ? a.index - b.index : a.remainder > b.remainder ? -1 : 1,
    );
  let left = magnitude - parts.reduce((sum, part) => sum + part, 0n);
  for (const { index } of byRemainder) {
    if (left === 0n) break;
    parts[index] = parts[index]! + 1n;
    left -= 1n;
  }
  return negative ? parts.map((part) => -part) : parts;
}
