# Money Policy and Document Exchange Rate Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give invoicing-kit 0.17.0 an exact, declared money policy (rounding and tax level, with no lost cents) and a frozen per-document exchange rate with base-currency amounts, both opt-in and backward compatible.

**Architecture:**
- One pure calculator (`src/lib/money/`) computes line subtotals, taxes and base-currency amounts under a `MoneyPolicy`, using exact largest-remainder allocation.
- One shared line builder replaces the copy-pasted loops in the four document services.
- One issuance planner decides policy and rate for every write: drafts follow the current policy, and the first issue freezes policy and rate.
- An optional consumer-supplied `ExchangeRateProvider` answers rates.

**Tech Stack:** TypeScript, Bun, Hono + `@hono/zod-openapi`, Zod, Prisma 7 (adapter-pg), Vitest.

**Spec:** `docs/superpowers/specs/2026-09-25-document-exchange-rate-design.md` (read it first).

## Global Constraints

- **Do not commit, do not create or switch branches.** Leave all changes uncommitted in the working tree. Wherever a normal plan would commit, run the task's verification instead.
- **No magic literals for domain vocabulary** (repo `CLAUDE.md`). New enums `RoundingMode`, `TaxLevel`, `BaseTaxMethod` and `ExchangeRateSource` live as const-enums in `src/types.ts`. Compare against them, never against string literals.
- **Money is `bigint` minor units.** No `Number` anywhere in money math. Rates and quantities are `DecimalString`.
- **Scales:** quantity 4 decimals, tax rate 4 decimals, exchange rate 8 decimals.
- **Currency conversion always rounds half-up**, regardless of the policy's rounding mode.
- **Currency codes are lowercase via `normalizeCurrency`.**
- **The default policy is `LEGACY_MONEY_POLICY`** (truncate, line level). With no `moneyPolicy`/`exchangeRates` config, every existing test must pass unchanged.
- **Exchange rate format in request bodies:** `^\d{1,10}(\.\d{1,8})?$` and `> 0`. It is stored canonical (no trailing fractional zeros).
- **New error codes:**
  - `EXCHANGE_RATE_REQUIRED` (422)
  - `EXCHANGE_RATE_NOT_APPLICABLE` (422)
  - `EXCHANGE_RATE_FROZEN` (422)
  - `CURRENCY_MISMATCH` (422)
- **Provider contract:**
  - It returns `null` when no rate is known, which becomes `EXCHANGE_RATE_REQUIRED`.
  - A thrown error propagates unchanged.
  - The provider is called **before** the write transaction opens.
- **Commands** run from `packages/invoicing-kit`:
  - Unit: `bunx vitest run tests/unit`
  - Typecheck: `bun run typecheck`
  - DB-backed suites:
    ```bash
    export INVOICING_KIT_TEST_DATABASE_URL="postgresql://test:test@localhost:5544/invoicing_kit_test"
    bun run db:up && bun run db:push
    bunx vitest run tests/conformance tests/integration
    ```
- **Baseline before this plan:** unit 27/27 pass; typecheck clean. Conformance + integration: 360 pass / 11 fail. The 11 existing failures, which must not grow:
  - `cross.test.ts` [prisma] ×2
  - `fiscal-documents.test.ts` [prisma] ×4
  - `sequences.test.ts` [prisma] concurrent ×1
  - `transactions.test.ts` [prisma] ×3
  - `integration/smoke.test.ts` ×1

## Review Focus

1. **Zero-price lines with a percentage tax** (all allocation weights zero): calculation must not throw, and every part is `0`. Pinned in Task 1 (`allocate`) and Task 2 (`calculateDocument`).
2. **A provider that returns a rate with trailing zeros or more than 8 decimals.** `"59.34700000"` is stored as `"59.347"`. `"59.123456789"` fails the issue with an error and the document stays a draft. Pinned in Task 6.
3. **An issued document set back to draft and issued again:** the frozen rate and policy must not be re-resolved. Pinned in Task 6.
4. **Line order on Prisma reads:** allocation tie-breaks follow line position, so re-reads must return lines in insertion order. Pinned in Task 3 (conformance).
5. **A note given an explicit currency that differs from its referenced document** → 422 `CURRENCY_MISMATCH`, and nothing is written. Pinned in Task 8.

## File Structure

| File | Responsibility |
|---|---|
| `src/types.ts` (modify) | New const-enums, `MoneyPolicy`, new `Document` / line / line-tax fields |
| `src/lib/money/decimal.ts` (new) | Scales, `parseScaled`, `canonicalDecimal`, `pow10` |
| `src/lib/money/rounding.ts` (new) | `roundDiv(numerator, denominator, mode)` |
| `src/lib/money/allocate.ts` (new) | `allocate(total, weights)`, largest remainder |
| `src/lib/money/policy.ts` (new) | `LEGACY_MONEY_POLICY`, `RECOMMENDED_MONEY_POLICY`, `parseMoneyPolicy` |
| `src/lib/money/calculate.ts` (new) | `calculateDocument` (pure) |
| `src/lib/money/settings.ts` (new) | `MoneySettings`, `buildMoneySettings(config)` |
| `src/lib/money/index.ts` (new) | Barrel |
| `src/lib/exchange.ts` (new) | Rate schema, exceptions, `resolveIssueExchange`, `exchangeOf`, `manualRateBaseCurrency` |
| `src/lib/document-issuance.ts` (new) | `planDocumentWrite`, `documentMoneyFields`, `DocumentServiceOptions` |
| `src/lib/document-lines.ts` (new) | `buildDocumentLines`, `lineInputsOf` |
| `src/lib/document-response.ts` (new) | Shared response fields and mappers for money fields |
| `src/lib/calculator.ts`, `src/lib/tax-strategy.ts` (delete) | Replaced by `lib/money` |
| `src/config.ts` (modify) | `ExchangeRateProvider`, `moneyPolicy`, `exchangeRates` |
| `src/lib/errors.ts` (modify) | 4 error codes |
| `src/adapters/types.ts`, memory and Prisma document adapters and mappers (modify) | New fields |
| `packages/cli/templates/v0/invoicing.prisma` (modify) | New columns |
| `src/domains/{invoices,quotes,notes,vendor-bills}/{service,validation,mappers}.ts` (modify) | Use the builder and planner; expose fields |
| `src/domains/documents/{validation,service,routes}.ts` (new) | `POST /documents/calculate` |
| `src/services.ts`, `src/create.ts`, `src/router.ts`, `src/index.ts` (modify) | Wiring and exports |
| `tests/unit/*` (new/modify), `tests/conformance/documents.test.ts`, `tests/integration/{harness,exchange-rate}.ts` | Tests |

---

### Task 1: Money primitives

**Files:**
- Modify: `src/types.ts` (append after `DocumentSide`)
- Create: `src/lib/money/decimal.ts`, `src/lib/money/rounding.ts`, `src/lib/money/allocate.ts`, `src/lib/money/policy.ts`
- Test: `tests/unit/money-primitives.test.ts`

**Interfaces:**
- Produces:
  - `RoundingMode`, `TaxLevel`, `BaseTaxMethod`, `ExchangeRateSource` (const-enums + types)
  - `interface MoneyPolicy { rounding: RoundingMode; taxLevel: TaxLevel; baseTaxMethod: BaseTaxMethod }`
  - `parseScaled(value: DecimalString, scale: number): bigint`
  - `canonicalDecimal(value: DecimalString): DecimalString`
  - `pow10(n: number): bigint`
  - `QUANTITY_SCALE = 4`, `TAX_RATE_SCALE = 4`, `EXCHANGE_RATE_SCALE = 8`
  - `roundDiv(numerator: bigint, denominator: bigint, mode: RoundingMode): bigint`
  - `allocate(total: bigint, weights: readonly bigint[]): bigint[]`
  - `LEGACY_MONEY_POLICY`, `RECOMMENDED_MONEY_POLICY`
  - `parseMoneyPolicy(value: unknown): MoneyPolicy | null`

- [ ] **Step 1: Write the failing test** — `tests/unit/money-primitives.test.ts`

```ts
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
  const cases: Array<[bigint, bigint, RoundingMode, bigint]> = [
    [4995n, 10n, RoundingMode.HalfUp, 500n],
    [4995n, 10n, RoundingMode.HalfEven, 500n],
    [4985n, 10n, RoundingMode.HalfEven, 498n],
    [4995n, 10n, RoundingMode.Truncate, 499n],
    [4994n, 10n, RoundingMode.HalfUp, 499n],
    [4996n, 10n, RoundingMode.Truncate, 499n],
    [-4995n, 10n, RoundingMode.HalfUp, -500n],
    [-4995n, 10n, RoundingMode.Truncate, -499n],
    [5000n, 10n, RoundingMode.HalfUp, 500n],
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
```

- [ ] **Step 2: Run it and confirm it fails**

Run: `bunx vitest run tests/unit/money-primitives.test.ts`
Expected: FAIL. The modules can't be resolved (`Failed to resolve import "../../src/lib/money/decimal"`).

- [ ] **Step 3: Add the types.** Append to `src/types.ts` after the `DocumentSide` block:

```ts
/** How a fractional minor-unit amount is rounded. `truncate` reproduces pre-0.17 math and loses fractions. */
export const RoundingMode = {
  HalfUp: "half_up",
  HalfEven: "half_even",
  Truncate: "truncate",
} as const;
export type RoundingMode = (typeof RoundingMode)[keyof typeof RoundingMode];

/** Where percentage tax is rounded: per line, or once per tax on the document's taxable total. */
export const TaxLevel = {
  Line: "line",
  Document: "document",
} as const;
export type TaxLevel = (typeof TaxLevel)[keyof typeof TaxLevel];

/** How base-currency tax is derived: recomputed on converted bases, or converted from document-currency tax. */
export const BaseTaxMethod = {
  Recompute: "recompute",
  Convert: "convert",
} as const;
export type BaseTaxMethod = (typeof BaseTaxMethod)[keyof typeof BaseTaxMethod];

/** Where a document's exchange rate came from. */
export const ExchangeRateSource = {
  Identity: "identity",
  Provider: "provider",
  Manual: "manual",
  Referenced: "referenced",
} as const;
export type ExchangeRateSource = (typeof ExchangeRateSource)[keyof typeof ExchangeRateSource];

/** How a tenant's amounts are rounded and taxed. Recorded on each document at issue. */
export interface MoneyPolicy {
  rounding: RoundingMode;
  taxLevel: TaxLevel;
  baseTaxMethod: BaseTaxMethod;
}
```

- [ ] **Step 4: Implement the modules**

`src/lib/money/decimal.ts`:

```ts
import type { DecimalString } from "../../types";

const DECIMAL_PATTERN = /^-?\d+(\.\d+)?$/;

/** Digits after the decimal point used by the money math. */
export const QUANTITY_SCALE = 4;
export const TAX_RATE_SCALE = 4;
export const EXCHANGE_RATE_SCALE = 8;

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

/** "59.347" at scale 8 → 5934700000n. Throws when a non-zero digit falls beyond `scale`. */
export function parseScaled(value: DecimalString, scale: number): bigint {
  const { negative, whole, fraction } = splitDecimal(value);
  if (/[1-9]/.test(fraction.slice(scale))) {
    throw new RangeError(`"${value}" has more than ${scale} decimal places`);
  }
  const scaled = BigInt(whole + fraction.slice(0, scale).padEnd(scale, "0"));
  return negative ? -scaled : scaled;
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
```

`src/lib/money/rounding.ts`:

```ts
import { RoundingMode } from "../../types";

/** numerator ÷ denominator rounded to an integer under `mode`, by magnitude with the sign preserved. */
export function roundDiv(numerator: bigint, denominator: bigint, mode: RoundingMode): bigint {
  if (denominator <= 0n) throw new RangeError("denominator must be positive");
  const negative = numerator < 0n;
  const magnitude = negative ? -numerator : numerator;
  const quotient = magnitude / denominator;
  const twiceRemainder = (magnitude % denominator) * 2n;
  let rounded = quotient;
  if (mode === RoundingMode.HalfUp && twiceRemainder >= denominator) rounded = quotient + 1n;
  if (
    mode === RoundingMode.HalfEven &&
    (twiceRemainder > denominator || (twiceRemainder === denominator && quotient % 2n === 1n))
  ) {
    rounded = quotient + 1n;
  }
  return negative ? -rounded : rounded;
}
```

`src/lib/money/allocate.ts`:

```ts
/**
 * Splits `total` into integer parts proportional to `weights` (largest remainder).
 * The parts always sum to `total`; ties go to the earlier position; all-zero
 * weights split evenly.
 */
export function allocate(total: bigint, weights: readonly bigint[]): bigint[] {
  if (weights.length === 0) {
    if (total !== 0n) throw new RangeError("cannot allocate a non-zero total across zero parts");
    return [];
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
```

`src/lib/money/policy.ts`:

```ts
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
```

- [ ] **Step 5: Run the tests and confirm they pass**

Run: `bunx vitest run tests/unit/money-primitives.test.ts && bun run typecheck`
Expected: PASS, and typecheck clean.

---

### Task 2: `calculateDocument`

**Files:**
- Create: `src/lib/money/calculate.ts`, `src/lib/money/index.ts`
- Test: `tests/unit/calculate-document.test.ts`

**Interfaces:**
- Consumes (Task 1): `roundDiv`, `allocate`, `parseScaled`, `pow10`, the scales, and the policy presets.
- Produces:

```ts
interface TaxDefinition { id: string; type: TaxType; rate: DecimalString }
interface CalculationLineInput { quantity: DecimalString; price: BigintMinor; taxes: readonly TaxDefinition[] }
interface CalculateDocumentInput { lines: readonly CalculationLineInput[]; policy: MoneyPolicy; exchangeRate?: DecimalString | null }
interface LineTaxCalculation { taxId: string; taxAmount: BigintMinor; baseTaxAmount: BigintMinor | null }
interface LineCalculation { subtotal: BigintMinor; taxAmount: BigintMinor; total: BigintMinor; baseSubtotal: BigintMinor | null; taxes: LineTaxCalculation[] }
interface TaxTotal { taxId: string; amount: BigintMinor; baseAmount: BigintMinor | null }
interface AmountTotals { subtotal: BigintMinor; tax: BigintMinor; total: BigintMinor }
interface DocumentCalculation extends AmountTotals { base: AmountTotals | null; lines: LineCalculation[]; taxTotals: TaxTotal[] }
function calculateDocument(input: CalculateDocumentInput): DocumentCalculation
```

- [ ] **Step 1: Write the failing test** — `tests/unit/calculate-document.test.ts`

```ts
import { describe, expect, test } from "vitest";
import { BaseTaxMethod, RoundingMode, TaxLevel, TaxType } from "../../src/types";
import type { MoneyPolicy } from "../../src/types";
import {
  LEGACY_MONEY_POLICY,
  RECOMMENDED_MONEY_POLICY,
  calculateDocument,
  type TaxDefinition,
} from "../../src/lib/money";

const itbis18: TaxDefinition = { id: "itbis", type: TaxType.Percentage, rate: "0.18" };
const vat21: TaxDefinition = { id: "vat", type: TaxType.Percentage, rate: "0.2100" };
const fee50: TaxDefinition = { id: "fee", type: TaxType.Fixed, rate: "50" };

describe("legacy policy reproduces pre-0.17 math", () => {
  test("truncated subtotal and per-line truncated tax", () => {
    const result = calculateDocument({
      policy: LEGACY_MONEY_POLICY,
      lines: [
        { quantity: "2.5", price: 1000n, taxes: [] },
        { quantity: "1.5", price: 333n, taxes: [] },
        { quantity: "1", price: 10000n, taxes: [vat21] },
        { quantity: "3", price: 1000n, taxes: [fee50] },
      ],
    });
    expect(result.lines.map((line) => line.subtotal)).toEqual([2500n, 499n, 10000n, 3000n]);
    expect(result.lines.map((line) => line.taxAmount)).toEqual([0n, 0n, 2100n, 150n]);
    expect(result.subtotal).toBe(15999n);
    expect(result.tax).toBe(2250n);
    expect(result.total).toBe(18249n);
    expect(result.base).toBeNull();
  });
});

describe("recommended policy", () => {
  test("half-up line subtotal: 1.5 × 3.33 = 5.00", () => {
    const result = calculateDocument({
      policy: RECOMMENDED_MONEY_POLICY,
      lines: [{ quantity: "1.5", price: 333n, taxes: [] }],
    });
    expect(result.subtotal).toBe(500n);
  });

  test("document-level tax is one rounding per tax, allocated back exactly", () => {
    const lines = [1003n, 1003n, 1003n].map((price) => ({ quantity: "1", price, taxes: [itbis18] }));
    const documentLevel = calculateDocument({ policy: RECOMMENDED_MONEY_POLICY, lines });
    expect(documentLevel.tax).toBe(542n); // round(3009 × 18%) = round(541.62)
    expect(documentLevel.lines.map((line) => line.taxAmount)).toEqual([181n, 181n, 180n]);
    expect(documentLevel.taxTotals).toEqual([{ taxId: "itbis", amount: 542n, baseAmount: null }]);

    const lineLevel = calculateDocument({
      policy: { ...RECOMMENDED_MONEY_POLICY, taxLevel: TaxLevel.Line },
      lines,
    });
    expect(lineLevel.tax).toBe(543n); // 3 × round(180.54)
  });

  test("zero-price lines with a percentage tax stay zero", () => {
    const result = calculateDocument({
      policy: RECOMMENDED_MONEY_POLICY,
      lines: [
        { quantity: "1", price: 0n, taxes: [itbis18] },
        { quantity: "2", price: 0n, taxes: [itbis18] },
      ],
      exchangeRate: "59.347",
    });
    expect(result.total).toBe(0n);
    expect(result.base).toEqual({ subtotal: 0n, tax: 0n, total: 0n });
  });
});

describe("base currency", () => {
  test("USD 1,000 + 18% at 59.3470 → RD$59,347.00 + 10,682.46 = 70,029.46", () => {
    const result = calculateDocument({
      policy: RECOMMENDED_MONEY_POLICY,
      lines: [{ quantity: "1", price: 100_000n, taxes: [itbis18] }],
      exchangeRate: "59.3470",
    });
    expect(result.total).toBe(118_000n);
    expect(result.base).toEqual({ subtotal: 5_934_700n, tax: 1_068_246n, total: 7_002_946n });
    expect(result.lines[0]!.baseSubtotal).toBe(5_934_700n);
    expect(result.lines[0]!.taxes[0]!.baseTaxAmount).toBe(1_068_246n);
  });

  test("recompute and convert differ exactly where the spec says", () => {
    const input = {
      lines: [{ quantity: "1", price: 1005n, taxes: [itbis18] }],
      exchangeRate: "58.5",
    };
    const recompute = calculateDocument({ ...input, policy: RECOMMENDED_MONEY_POLICY });
    const convert = calculateDocument({
      ...input,
      policy: { ...RECOMMENDED_MONEY_POLICY, baseTaxMethod: BaseTaxMethod.Convert },
    });
    expect(recompute.base!.subtotal).toBe(58_793n); // round(1005 × 58.5)
    expect(recompute.base!.tax).toBe(10_583n); // round(58793 × 18%)
    expect(convert.base!.tax).toBe(10_589n); // round(181 × 58.5)
  });

  test("fixed taxes are converted, never recomputed", () => {
    const result = calculateDocument({
      policy: RECOMMENDED_MONEY_POLICY,
      lines: [{ quantity: "3", price: 1000n, taxes: [fee50] }],
      exchangeRate: "2",
    });
    expect(result.lines[0]!.taxes[0]!.baseTaxAmount).toBe(300n);
  });

  test("identity rate returns the document amounts", () => {
    const result = calculateDocument({
      policy: RECOMMENDED_MONEY_POLICY,
      lines: [{ quantity: "1.5", price: 333n, taxes: [itbis18] }],
      exchangeRate: "1",
    });
    expect(result.base).toEqual({ subtotal: result.subtotal, tax: result.tax, total: result.total });
  });

  test("rejects a non-positive rate", () => {
    expect(() =>
      calculateDocument({ policy: RECOMMENDED_MONEY_POLICY, lines: [], exchangeRate: "0" }),
    ).toThrow(RangeError);
  });
});

describe("invariants hold for every policy (seeded random documents)", () => {
  function mulberry32(seed: number) {
    return () => {
      seed |= 0;
      seed = (seed + 0x6d2b79f5) | 0;
      let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  const random = mulberry32(20260925);
  const pick = <T>(values: readonly T[]) => values[Math.floor(random() * values.length)]!;
  const policies: MoneyPolicy[] = [];
  for (const rounding of Object.values(RoundingMode))
    for (const taxLevel of Object.values(TaxLevel))
      for (const baseTaxMethod of Object.values(BaseTaxMethod))
        policies.push({ rounding, taxLevel, baseTaxMethod });
  const taxPool = [itbis18, { id: "t16", type: TaxType.Percentage, rate: "0.16" }, fee50];
  const sum = (values: bigint[]) => values.reduce((a, b) => a + b, 0n);

  test("sums, per-tax totals and base totals are exact", () => {
    for (let run = 0; run < 1500; run++) {
      const lines = Array.from({ length: 1 + Math.floor(random() * 7) }, () => ({
        quantity: `${Math.floor(random() * 20)}.${String(Math.floor(random() * 10_000)).padStart(4, "0")}`,
        price: BigInt(Math.floor(random() * 1_000_000_000)),
        taxes: taxPool.filter(() => random() < 0.5),
      }));
      const exchangeRate = random() < 0.3 ? null : `${Math.floor(random() * 200)}.${String(Math.floor(random() * 1e8)).padStart(8, "0")}`;
      const policy = pick(policies);
      if (exchangeRate === "0.00000000") continue;
      const result = calculateDocument({ lines, policy, exchangeRate });

      expect(sum(result.lines.map((line) => line.subtotal))).toBe(result.subtotal);
      expect(sum(result.lines.map((line) => line.taxAmount))).toBe(result.tax);
      expect(result.subtotal + result.tax).toBe(result.total);
      for (const line of result.lines) expect(line.subtotal + line.taxAmount).toBe(line.total);
      for (const total of result.taxTotals) {
        const perLine = result.lines.flatMap((line) => line.taxes.filter((t) => t.taxId === total.taxId));
        expect(sum(perLine.map((t) => t.taxAmount))).toBe(total.amount);
      }
      if (result.base) {
        expect(sum(result.lines.map((line) => line.baseSubtotal!))).toBe(result.base.subtotal);
        expect(sum(result.lines.flatMap((line) => line.taxes.map((t) => t.baseTaxAmount!)))).toBe(result.base.tax);
        expect(result.base.subtotal + result.base.tax).toBe(result.base.total);
      }
    }
  });
});
```

- [ ] **Step 2: Run it and confirm it fails**

Run: `bunx vitest run tests/unit/calculate-document.test.ts`
Expected: FAIL. `../../src/lib/money` can't be resolved.

- [ ] **Step 3: Implement** — `src/lib/money/calculate.ts`

```ts
import type { BigintMinor, DecimalString, MoneyPolicy } from "../../types";
import { BaseTaxMethod, RoundingMode, TaxLevel, TaxType } from "../../types";
import { allocate } from "./allocate";
import { EXCHANGE_RATE_SCALE, QUANTITY_SCALE, TAX_RATE_SCALE, parseScaled, pow10 } from "./decimal";
import { roundDiv } from "./rounding";

export interface TaxDefinition {
  id: string;
  type: TaxType;
  rate: DecimalString;
}
export interface CalculationLineInput {
  quantity: DecimalString;
  price: BigintMinor;
  taxes: readonly TaxDefinition[];
}
export interface CalculateDocumentInput {
  lines: readonly CalculationLineInput[];
  policy: MoneyPolicy;
  /** Base-currency units per 1 document unit. Omit or null for no base amounts. */
  exchangeRate?: DecimalString | null;
}
export interface LineTaxCalculation {
  taxId: string;
  taxAmount: BigintMinor;
  baseTaxAmount: BigintMinor | null;
}
export interface LineCalculation {
  subtotal: BigintMinor;
  taxAmount: BigintMinor;
  total: BigintMinor;
  baseSubtotal: BigintMinor | null;
  taxes: LineTaxCalculation[];
}
export interface TaxTotal {
  taxId: string;
  amount: BigintMinor;
  baseAmount: BigintMinor | null;
}
export interface AmountTotals {
  subtotal: BigintMinor;
  tax: BigintMinor;
  total: BigintMinor;
}
export interface DocumentCalculation extends AmountTotals {
  base: AmountTotals | null;
  lines: LineCalculation[];
  taxTotals: TaxTotal[];
}

const QUANTITY_FACTOR = pow10(QUANTITY_SCALE);
const TAX_RATE_FACTOR = pow10(TAX_RATE_SCALE);
const EXCHANGE_RATE_FACTOR = pow10(EXCHANGE_RATE_SCALE);

interface TaxGroup {
  tax: TaxDefinition;
  occurrences: Array<{ line: number; position: number }>;
}
/** Tax amounts indexed [line][position in that line's taxes]. */
type TaxMatrix = bigint[][];

const sum = (values: readonly bigint[]) => values.reduce((total, value) => total + value, 0n);

function groupTaxes(lines: readonly CalculationLineInput[]): TaxGroup[] {
  const groups = new Map<string, TaxGroup>();
  lines.forEach((line, lineIndex) =>
    line.taxes.forEach((tax, position) => {
      const group = groups.get(tax.id) ?? { tax, occurrences: [] };
      group.occurrences.push({ line: lineIndex, position });
      groups.set(tax.id, group);
    }),
  );
  return [...groups.values()];
}

function emptyMatrix(lines: readonly CalculationLineInput[]): TaxMatrix {
  return lines.map((line) => line.taxes.map(() => 0n));
}

function readGroup(matrix: TaxMatrix, group: TaxGroup): bigint[] {
  return group.occurrences.map(({ line, position }) => matrix[line]![position]!);
}

function writeGroup(matrix: TaxMatrix, group: TaxGroup, amounts: readonly bigint[]): void {
  group.occurrences.forEach(({ line, position }, index) => {
    matrix[line]![position] = amounts[index]!;
  });
}

/** Percentage taxes on `bases` under the policy; fixed taxes are an amount per unit of quantity. */
function computeTaxes(
  lines: readonly CalculationLineInput[],
  groups: readonly TaxGroup[],
  bases: readonly bigint[],
  policy: MoneyPolicy,
): TaxMatrix {
  const matrix = emptyMatrix(lines);
  for (const group of groups) {
    const rate = parseScaled(group.tax.rate, TAX_RATE_SCALE);
    if (group.tax.type === TaxType.Fixed) {
      writeGroup(
        matrix,
        group,
        group.occurrences.map(({ line }) =>
          roundDiv(
            rate * parseScaled(lines[line]!.quantity, QUANTITY_SCALE),
            TAX_RATE_FACTOR * QUANTITY_FACTOR,
            policy.rounding,
          ),
        ),
      );
      continue;
    }
    const taxable = group.occurrences.map(({ line }) => bases[line]!);
    if (policy.taxLevel === TaxLevel.Line) {
      writeGroup(matrix, group, taxable.map((base) => roundDiv(base * rate, TAX_RATE_FACTOR, policy.rounding)));
    } else {
      const groupTax = roundDiv(sum(taxable) * rate, TAX_RATE_FACTOR, policy.rounding);
      writeGroup(matrix, group, allocate(groupTax, taxable));
    }
  }
  return matrix;
}

/** Currency conversion always rounds half-up, whatever the policy. */
function convert(amount: bigint, rate: bigint): bigint {
  return roundDiv(amount * rate, EXCHANGE_RATE_FACTOR, RoundingMode.HalfUp);
}

/** Converts each group's total once and allocates it back over the group's lines. */
function convertGroups(target: TaxMatrix, source: TaxMatrix, groups: readonly TaxGroup[], rate: bigint): void {
  for (const group of groups) {
    const amounts = readGroup(source, group);
    writeGroup(target, group, allocate(convert(sum(amounts), rate), amounts));
  }
}

export function calculateDocument(input: CalculateDocumentInput): DocumentCalculation {
  const { lines, policy } = input;
  const groups = groupTaxes(lines);
  const subtotals = lines.map((line) =>
    roundDiv(parseScaled(line.quantity, QUANTITY_SCALE) * line.price, QUANTITY_FACTOR, policy.rounding),
  );
  const taxes = computeTaxes(lines, groups, subtotals, policy);

  let baseSubtotals: bigint[] | null = null;
  let baseTaxes: TaxMatrix | null = null;
  if (input.exchangeRate != null) {
    const rate = parseScaled(input.exchangeRate, EXCHANGE_RATE_SCALE);
    if (rate <= 0n) throw new RangeError("exchange rate must be greater than 0");
    baseSubtotals = allocate(convert(sum(subtotals), rate), subtotals);
    const fixedGroups = groups.filter((group) => group.tax.type === TaxType.Fixed);
    if (policy.baseTaxMethod === BaseTaxMethod.Recompute) {
      const percentageGroups = groups.filter((group) => group.tax.type !== TaxType.Fixed);
      baseTaxes = computeTaxes(lines, percentageGroups, baseSubtotals, policy);
      convertGroups(baseTaxes, taxes, fixedGroups, rate);
    } else {
      baseTaxes = emptyMatrix(lines);
      convertGroups(baseTaxes, taxes, groups, rate);
    }
  }

  const lineResults: LineCalculation[] = lines.map((line, index) => {
    const subtotal = subtotals[index]!;
    const taxAmount = sum(taxes[index]!);
    return {
      subtotal,
      taxAmount,
      total: subtotal + taxAmount,
      baseSubtotal: baseSubtotals ? baseSubtotals[index]! : null,
      taxes: line.taxes.map((tax, position) => ({
        taxId: tax.id,
        taxAmount: taxes[index]![position]!,
        baseTaxAmount: baseTaxes ? baseTaxes[index]![position]! : null,
      })),
    };
  });

  const subtotal = sum(subtotals);
  const tax = sum(lineResults.map((line) => line.taxAmount));
  let base: AmountTotals | null = null;
  if (baseSubtotals && baseTaxes) {
    const baseSubtotal = sum(baseSubtotals);
    const baseTax = sum(baseTaxes.flat());
    base = { subtotal: baseSubtotal, tax: baseTax, total: baseSubtotal + baseTax };
  }

  return {
    subtotal,
    tax,
    total: subtotal + tax,
    base,
    lines: lineResults,
    taxTotals: groups.map((group) => ({
      taxId: group.tax.id,
      amount: sum(readGroup(taxes, group)),
      baseAmount: baseTaxes ? sum(readGroup(baseTaxes, group)) : null,
    })),
  };
}
```

`src/lib/money/index.ts`:

```ts
export * from "./allocate";
export * from "./calculate";
export * from "./decimal";
export * from "./policy";
export * from "./rounding";
```

- [ ] **Step 4: Run the tests and confirm they pass**

Run: `bunx vitest run tests/unit/calculate-document.test.ts tests/unit/money-primitives.test.ts && bun run typecheck`
Expected: PASS.

---

### Task 3: Data model: types, adapters, schema

**Files:**
- Modify: `src/types.ts` (`Document`, `DocumentLineItem`, `DocumentLineItemTax`)
- Modify: `src/adapters/types.ts` (`NewDocumentLineItem`, `NewDocument`, `DocumentUpdate`)
- Modify: `src/adapters/memory/documents.ts`, `src/adapters/prisma/documents.ts`, `src/adapters/prisma/mappers.ts`
- Modify: `packages/cli/templates/v0/invoicing.prisma`
- Test: `tests/conformance/documents.test.ts` (add tests)

**Interfaces:**
- Produces:
  - Domain fields:
    - `Document.{moneyPolicy, baseCurrency, exchangeRate, exchangeRateDate, exchangeRateSource, baseSubtotal, baseTax, baseTotal}` (all `| null`)
    - `DocumentLineItem.baseSubtotal`
    - `DocumentLineItemTax.baseTaxAmount`
  - The same fields are optional on `NewDocument` / `DocumentUpdate`. `NewDocumentLineItem.baseSubtotal?` and `taxes[].baseTaxAmount?` are optional.

- [ ] **Step 1: Write the failing conformance tests.** Append inside the `describeForEachAdapter("DocumentRepository", …)` body in `tests/conformance/documents.test.ts`:

```ts
  test("round-trips exchange rate, policy and base amounts", async () => {
    const { organizationId } = await seed(ctx.repos);
    const { client, product, tax } = await setup(ctx, organizationId);
    const doc = await ctx.repos.documents.create({
      type: "INVOICE",
      organizationId,
      clientId: client.id,
      documentNumber: 1,
      issueDate: new Date("2026-09-25"),
      currency: "usd",
      subtotal: 100_000n,
      tax: 18_000n,
      total: 118_000n,
      moneyPolicy: { rounding: "half_up", taxLevel: "document", baseTaxMethod: "recompute" },
      baseCurrency: "dop",
      exchangeRate: "59.347",
      exchangeRateDate: new Date("2026-09-25"),
      exchangeRateSource: "provider",
      baseSubtotal: 5_934_700n,
      baseTax: 1_068_246n,
      baseTotal: 7_002_946n,
      lineItems: [
        {
          productId: product.id,
          quantity: "1",
          price: 100_000n,
          currency: "usd",
          taxes: [{ taxId: tax.id, taxAmount: 18_000n, baseTaxAmount: 1_068_246n }],
          taxAmount: 18_000n,
          total: 118_000n,
          baseSubtotal: 5_934_700n,
        },
      ],
    });
    const found = await ctx.repos.documents.findById(doc.id, organizationId);
    expect(found!.exchangeRate).toBe("59.347");
    expect(found!.exchangeRateSource).toBe("provider");
    expect(found!.exchangeRateDate!.toISOString().slice(0, 10)).toBe("2026-09-25");
    expect(found!.moneyPolicy).toEqual({ rounding: "half_up", taxLevel: "document", baseTaxMethod: "recompute" });
    expect([found!.baseSubtotal, found!.baseTax, found!.baseTotal]).toEqual([5_934_700n, 1_068_246n, 7_002_946n]);
    expect(found!.lineItems[0]!.baseSubtotal).toBe(5_934_700n);
    expect(found!.lineItems[0]!.taxes[0]!.baseTaxAmount).toBe(1_068_246n);
  });

  test("documents without exchange data read back null fields", async () => {
    const { organizationId } = await seed(ctx.repos);
    const { client, product } = await setup(ctx, organizationId);
    const doc = await ctx.repos.documents.create({
      type: "INVOICE",
      organizationId,
      clientId: client.id,
      documentNumber: 2,
      issueDate: new Date("2026-09-25"),
      subtotal: 100n,
      tax: 0n,
      total: 100n,
      lineItems: [
        { productId: product.id, quantity: "1", price: 100n, currency: "usd", taxes: [], taxAmount: 0n, total: 100n },
      ],
    });
    const found = await ctx.repos.documents.findById(doc.id, organizationId);
    expect(found!.moneyPolicy).toBeNull();
    expect(found!.exchangeRate).toBeNull();
    expect(found!.baseTotal).toBeNull();
    expect(found!.lineItems[0]!.baseSubtotal).toBeNull();
  });

  test("line items read back in insertion order after replaceLineItems", async () => {
    const { organizationId } = await seed(ctx.repos);
    const { client, product } = await setup(ctx, organizationId);
    const doc = await ctx.repos.documents.create({
      type: "INVOICE", organizationId, clientId: client.id, documentNumber: 3,
      issueDate: new Date("2026-09-25"), subtotal: 0n, tax: 0n, total: 0n, lineItems: [],
    });
    const prices = [30n, 10n, 20n, 50n, 40n];
    await ctx.repos.documents.replaceLineItems(
      doc.id,
      organizationId,
      prices.map((price) => ({ productId: product.id, quantity: "1", price, currency: "usd", taxes: [], taxAmount: 0n, total: price })),
    );
    const found = await ctx.repos.documents.findById(doc.id, organizationId);
    expect(found!.lineItems.map((line: { price: bigint }) => line.price)).toEqual(prices);
  });
```

- [ ] **Step 2: Run and confirm it fails**

Run (DB up, env exported): `bunx vitest run tests/conformance/documents.test.ts`
Expected: FAIL. TypeScript/Prisma reject the unknown fields (`exchangeRate`), and the memory reads return `undefined`.

- [ ] **Step 3: Extend the domain types** in `src/types.ts`.

Add to the `Document` interface, after `total`:

```ts
  /** Policy the document was issued under. Null for drafts and for documents issued before 0.17 (legacy). */
  moneyPolicy: MoneyPolicy | null;
  /** Tenant base currency the base amounts are in (lowercase). */
  baseCurrency: string | null;
  /** Base-currency units per 1 document-currency unit (canonical decimal). */
  exchangeRate: DecimalString | null;
  /** The date the rate applies to. */
  exchangeRateDate: Date | null;
  exchangeRateSource: ExchangeRateSource | null;
  baseSubtotal: BigintMinor | null;
  baseTax: BigintMinor | null;
  baseTotal: BigintMinor | null;
```

Add `baseSubtotal: BigintMinor | null;` to `DocumentLineItem` after `total`, and `baseTaxAmount: BigintMinor | null;` to `DocumentLineItemTax` after `taxAmount`. `MoneyPolicy` and `ExchangeRateSource` are declared in the same file (Task 1); declarations are hoisted, so their order doesn't matter.

- [ ] **Step 4: Extend the adapter input types** in `src/adapters/types.ts`.

In `NewDocumentLineItem`, change the `taxes` line and add the base field:

```ts
  taxes: Array<{ taxId: string; taxAmount: BigintMinor; baseTaxAmount?: BigintMinor | null }>;
  /** Line net in the base currency. */
  baseSubtotal?: BigintMinor | null;
```

Add to `NewDocument` (after `total`) **and** inside `DocumentUpdate`'s `Partial<{…}>` (after `total`):

```ts
  moneyPolicy?: MoneyPolicy | null;
  baseCurrency?: string | null;
  exchangeRate?: DecimalString | null;
  exchangeRateDate?: Date | null;
  exchangeRateSource?: ExchangeRateSource | null;
  baseSubtotal?: BigintMinor | null;
  baseTax?: BigintMinor | null;
  baseTotal?: BigintMinor | null;
```

Inside `Partial<{…}>` drop the `?` (Partial already makes them optional). Import `MoneyPolicy` and `ExchangeRateSource` as types from `../types`.

- [ ] **Step 5: Memory adapter** (`src/adapters/memory/documents.ts`).

In `insertLineItems`, add `baseSubtotal: item.baseSubtotal ?? null,` to the line object and `baseTaxAmount: tax.baseTaxAmount ?? null,` to the tax row.

In `create`, add after `total: data.total,`:

```ts
        moneyPolicy: data.moneyPolicy ?? null,
        baseCurrency: data.baseCurrency ?? null,
        exchangeRate: data.exchangeRate ?? null,
        exchangeRateDate: data.exchangeRateDate ?? null,
        exchangeRateSource: data.exchangeRateSource ?? null,
        baseSubtotal: data.baseSubtotal ?? null,
        baseTax: data.baseTax ?? null,
        baseTotal: data.baseTotal ?? null,
```

- [ ] **Step 6: Prisma adapter and mappers.**

In `src/adapters/prisma/documents.ts` `create` → `data`, add after `total: data.total,`:

```ts
          ...(data.moneyPolicy ? { moneyPolicy: data.moneyPolicy } : {}),
          baseCurrency: data.baseCurrency ?? null,
          exchangeRate: data.exchangeRate ?? null,
          exchangeRateDate: data.exchangeRateDate ?? null,
          exchangeRateSource: data.exchangeRateSource ?? null,
          baseSubtotal: data.baseSubtotal ?? null,
          baseTax: data.baseTax ?? null,
          baseTotal: data.baseTotal ?? null,
```

- In **both** line-item create blocks (`create` and `replaceLineItems`): add `baseSubtotal: lineItem.baseSubtotal ?? null,`, and in the nested taxes map add `baseTaxAmount: tax.baseTaxAmount ?? null,`.
- In `update`, a JSON column can't be set to `null` with a plain `null`. Replace `data: patch` with `data: prismaDocumentPatch(patch)` and add:

```ts
/** Prisma needs JSON columns omitted rather than set to a plain null. */
function prismaDocumentPatch(patch: DocumentUpdate): Record<string, unknown> {
  const { moneyPolicy, ...rest } = patch;
  return moneyPolicy ? { ...rest, moneyPolicy } : rest;
}
```

- Order line items deterministically in `DOCUMENT_RELATIONS_INCLUDE.lineItems`: add `orderBy: [{ createdAt: "asc" }, { id: "asc" }],` next to `include`.

In `src/adapters/prisma/mappers.ts`, `documentRowToDomain` gets, after `total`:

```ts
    moneyPolicy: parseMoneyPolicy(row.moneyPolicy),
    baseCurrency: row.baseCurrency ?? null,
    exchangeRate: row.exchangeRate != null ? canonicalDecimal(row.exchangeRate.toString()) : null,
    exchangeRateDate: row.exchangeRateDate ?? null,
    exchangeRateSource: (row.exchangeRateSource as ExchangeRateSource | null) ?? null,
    baseSubtotal: row.baseSubtotal ?? null,
    baseTax: row.baseTax ?? null,
    baseTotal: row.baseTotal ?? null,
```

- `documentLineItemRowToDomain` gets `baseSubtotal: row.baseSubtotal ?? null,`.
- `documentLineItemTaxRowToDomain` gets `baseTaxAmount: row.baseTaxAmount ?? null,`.
- Import `parseMoneyPolicy` and `canonicalDecimal` from `../../lib/money`, and `ExchangeRateSource` as a type.
- If a nested-relations mapper (`documentWithRelationsRowToDomain`) builds line items inline instead of calling these mappers, add the same two fields there.

- [ ] **Step 7: Template.** In `packages/cli/templates/v0/invoicing.prisma`:

In `model Document`, after the `total` line:

```prisma
  moneyPolicy            Json?        @map("money_policy")
  baseCurrency           String?      @map("base_currency") @db.VarChar(3)
  exchangeRate           Decimal?     @map("exchange_rate") @db.Decimal(18, 8)
  exchangeRateDate       DateTime?    @map("exchange_rate_date") @db.Date
  exchangeRateSource     String?      @map("exchange_rate_source") @db.VarChar(16)
  baseSubtotal           BigInt?      @map("base_subtotal") // Base-currency minor units
  baseTax                BigInt?      @map("base_tax")
  baseTotal              BigInt?      @map("base_total")
```

In `model DocumentLineItem`, after `total`: `baseSubtotal BigInt? @map("base_subtotal") // Line net, base-currency minor units`.
In `model DocumentLineItemTax`, after `taxAmount`: `baseTaxAmount BigInt? @map("base_tax_amount")`.

Then regenerate the test client: `bun run db:push`, which copies the templates into `tests/fixtures/prisma`, pushes, and generates `src/generated/test-prisma`.

- [ ] **Step 8: Run and confirm it passes**

Run: `bun run typecheck && bunx vitest run tests/conformance/documents.test.ts tests/unit`
Expected: PASS for both adapters. Typecheck may flag every place that builds a `Document` literal; add the new fields as `null` there (e.g. test factories).

---

### Task 4: Config, errors, money settings, exchange resolution

**Files:**
- Modify: `src/config.ts`, `src/lib/errors.ts`
- Create: `src/lib/money/settings.ts`, `src/lib/exchange.ts`
- Modify: `src/lib/money/index.ts` (export settings)
- Test: `tests/unit/exchange.test.ts`

**Interfaces:**
- Produces:

```ts
// src/config.ts
interface ExchangeRateProvider {
  baseCurrency(ctx: { organizationId: string }): string | Promise<string>;
  resolve(ctx: { organizationId: string; from: string; to: string; date: Date }): Promise<DecimalString | null>;
}
InvoicingKitConfig.moneyPolicy?: (ctx: { organizationId: string }) => MoneyPolicy | Promise<MoneyPolicy>
InvoicingKitConfig.exchangeRates?: ExchangeRateProvider

// src/lib/money/settings.ts
interface MoneySettings { policyFor(organizationId: string): Promise<MoneyPolicy>; exchangeRates: ExchangeRateProvider | null }
function buildMoneySettings(config?: Pick<InvoicingKitConfig, "moneyPolicy" | "exchangeRates">): MoneySettings

// src/lib/exchange.ts
const exchangeRateSchema: ZodType<DecimalString>
interface DocumentExchange { baseCurrency: string; rate: DecimalString; rateDate: Date; source: ExchangeRateSource }
ExchangeRateRequiredException(currency: string, date: Date)
ExchangeRateNotApplicableException(currency: string)
ExchangeRateFrozenException()
DocumentCurrencyMismatchException(currency: string, referencedCurrency: string)
function manualRateBaseCurrency(money: MoneySettings, organizationId: string, currency: string): Promise<string>
function exchangeOf(document: Document): DocumentExchange | null
function resolveIssueExchange(args: {
  money: MoneySettings; organizationId: string; currency: string; issueDate: Date;
  manualRate: DecimalString | null; referenced: DocumentExchange | null;
}): Promise<DocumentExchange | null>
```

- [ ] **Step 1: Write the failing test** — `tests/unit/exchange.test.ts`

```ts
import { describe, expect, test } from "vitest";
import { ExchangeRateSource } from "../../src/types";
import { buildMoneySettings } from "../../src/lib/money/settings";
import { LEGACY_MONEY_POLICY, RECOMMENDED_MONEY_POLICY } from "../../src/lib/money";
import {
  exchangeRateSchema,
  manualRateBaseCurrency,
  resolveIssueExchange,
} from "../../src/lib/exchange";

const issueDate = new Date("2026-09-25");
const provider = (rate: string | null) =>
  buildMoneySettings({
    moneyPolicy: () => RECOMMENDED_MONEY_POLICY,
    exchangeRates: { baseCurrency: () => "DOP", resolve: async () => rate },
  });

describe("money settings", () => {
  test("defaults to the legacy policy and no provider", async () => {
    const money = buildMoneySettings();
    expect(await money.policyFor("org")).toEqual(LEGACY_MONEY_POLICY);
    expect(money.exchangeRates).toBeNull();
  });
});

describe("exchangeRateSchema", () => {
  test("accepts and canonicalizes positive rates", () => {
    expect(exchangeRateSchema.parse("59.34700000")).toBe("59.347");
  });
  test("rejects zero, negatives and more than 8 decimals", () => {
    for (const bad of ["0", "0.00", "-1", "1.123456789", "abc"]) {
      expect(exchangeRateSchema.safeParse(bad).success).toBe(false);
    }
  });
});

describe("resolveIssueExchange", () => {
  const base = { organizationId: "org", issueDate, manualRate: null, referenced: null };

  test("no provider → null (feature off)", async () => {
    expect(await resolveIssueExchange({ ...base, money: buildMoneySettings(), currency: "usd" })).toBeNull();
  });
  test("base currency → identity rate", async () => {
    expect(await resolveIssueExchange({ ...base, money: provider("59"), currency: "dop" })).toEqual({
      baseCurrency: "dop", rate: "1", rateDate: issueDate, source: ExchangeRateSource.Identity,
    });
  });
  test("provider rate, canonicalized", async () => {
    const exchange = await resolveIssueExchange({ ...base, money: provider("59.34700000"), currency: "usd" });
    expect(exchange).toEqual({ baseCurrency: "dop", rate: "59.347", rateDate: issueDate, source: ExchangeRateSource.Provider });
  });
  test("manual rate wins over the provider", async () => {
    const exchange = await resolveIssueExchange({ ...base, money: provider("59"), currency: "usd", manualRate: "60.5" });
    expect(exchange!.source).toBe(ExchangeRateSource.Manual);
    expect(exchange!.rate).toBe("60.5");
  });
  test("referenced rate is inherited", async () => {
    const referenced = { baseCurrency: "dop", rate: "58", rateDate: new Date("2026-09-01"), source: ExchangeRateSource.Provider };
    const exchange = await resolveIssueExchange({ ...base, money: provider("59"), currency: "usd", referenced });
    expect(exchange).toEqual({ ...referenced, source: ExchangeRateSource.Referenced });
  });
  test("no rate → EXCHANGE_RATE_REQUIRED", async () => {
    await expect(resolveIssueExchange({ ...base, money: provider(null), currency: "usd" })).rejects.toThrow(
      /EXCHANGE_RATE_REQUIRED/,
    );
  });
  test("a thrown provider error propagates unchanged", async () => {
    const money = buildMoneySettings({
      exchangeRates: { baseCurrency: () => "dop", resolve: async () => { throw new Error("rate store down"); } },
    });
    await expect(resolveIssueExchange({ ...base, money, currency: "usd" })).rejects.toThrow("rate store down");
  });
  test("a provider rate with more than 8 decimals fails loudly", async () => {
    await expect(resolveIssueExchange({ ...base, money: provider("59.123456789"), currency: "usd" })).rejects.toThrow(RangeError);
  });
});

describe("manualRateBaseCurrency", () => {
  test("returns the base currency for a foreign document", async () => {
    expect(await manualRateBaseCurrency(provider("59"), "org", "usd")).toBe("dop");
  });
  test("rejects a base-currency document or a missing provider", async () => {
    await expect(manualRateBaseCurrency(provider("59"), "org", "dop")).rejects.toThrow(/EXCHANGE_RATE_NOT_APPLICABLE/);
    await expect(manualRateBaseCurrency(buildMoneySettings(), "org", "usd")).rejects.toThrow(/EXCHANGE_RATE_NOT_APPLICABLE/);
  });
});
```

- [ ] **Step 2: Run and confirm it fails**

Run: `bunx vitest run tests/unit/exchange.test.ts`
Expected: FAIL. The modules don't exist.

- [ ] **Step 3: Config.** In `src/config.ts` add (import `DecimalString` and `MoneyPolicy` types from `./types`):

```ts
/** Supplies the tenant's base currency and exchange rates. The kit never fetches rates itself. */
export interface ExchangeRateProvider {
  /** The tenant's base (reporting) currency, any case; the kit normalizes it. */
  baseCurrency(ctx: { organizationId: string }): string | Promise<string>;
  /**
   * Base units per 1 `from` unit effective on `date` (at most 8 decimals), or
   * null when no rate is known. A thrown error propagates to the caller.
   */
  resolve(ctx: { organizationId: string; from: string; to: string; date: Date }): Promise<DecimalString | null>;
}
```

and add to `InvoicingKitConfig`:

```ts
  /** Per-organization money policy. Absent → LEGACY_MONEY_POLICY (pre-0.17 math). */
  moneyPolicy?: (ctx: { organizationId: string }) => MoneyPolicy | Promise<MoneyPolicy>;
  /** Optional exchange-rate provider. Absent → documents never carry a rate. */
  exchangeRates?: ExchangeRateProvider;
```

- [ ] **Step 4: Errors.** In `src/lib/errors.ts` `ErrorCode`, add:

```ts
  // Money / exchange rate
  ExchangeRateRequired: "EXCHANGE_RATE_REQUIRED",
  ExchangeRateNotApplicable: "EXCHANGE_RATE_NOT_APPLICABLE",
  ExchangeRateFrozen: "EXCHANGE_RATE_FROZEN",
  DocumentCurrencyMismatch: "CURRENCY_MISMATCH",
```

- [ ] **Step 5: Money settings** — `src/lib/money/settings.ts`

```ts
import type { ExchangeRateProvider, InvoicingKitConfig } from "../../config";
import type { MoneyPolicy } from "../../types";
import { LEGACY_MONEY_POLICY } from "./policy";

export interface MoneySettings {
  policyFor(organizationId: string): Promise<MoneyPolicy>;
  exchangeRates: ExchangeRateProvider | null;
}

export function buildMoneySettings(
  config: Pick<InvoicingKitConfig, "moneyPolicy" | "exchangeRates"> = {},
): MoneySettings {
  return {
    async policyFor(organizationId) {
      return config.moneyPolicy ? await config.moneyPolicy({ organizationId }) : LEGACY_MONEY_POLICY;
    },
    exchangeRates: config.exchangeRates ?? null,
  };
}
```

Append `export * from "./settings";` to `src/lib/money/index.ts`.

- [ ] **Step 6: Exchange resolution** — `src/lib/exchange.ts`

```ts
import { z } from "zod";
import type { DecimalString, Document } from "../types";
import { ExchangeRateSource } from "../types";
import { normalizeCurrency } from "./currency";
import { ErrorCode, httpError } from "./errors";
import { EXCHANGE_RATE_SCALE, canonicalDecimal, parseScaled } from "./money/decimal";
import type { MoneySettings } from "./money/settings";

/** Request-body exchange rate: positive, up to 10 integer digits and 8 decimals, stored canonical. */
export const exchangeRateSchema = z
  .string()
  .regex(/^\d{1,10}(\.\d{1,8})?$/, "Up to 10 integer digits and 8 decimals")
  .refine((value) => parseScaled(value, EXCHANGE_RATE_SCALE) > 0n, "Must be greater than 0")
  .transform(canonicalDecimal);

export interface DocumentExchange {
  baseCurrency: string;
  rate: DecimalString;
  rateDate: Date;
  source: ExchangeRateSource;
}

const isoDate = (date: Date) => date.toISOString().slice(0, 10);

export const ExchangeRateRequiredException = (currency: string, date: Date) =>
  httpError({
    code: ErrorCode.ExchangeRateRequired,
    status: 422,
    message: `No exchange rate for ${currency} on ${isoDate(date)}; enter one or keep the document as a draft`,
  });

export const ExchangeRateNotApplicableException = (currency: string) =>
  httpError({
    code: ErrorCode.ExchangeRateNotApplicable,
    status: 422,
    message: `A ${currency} document takes no exchange rate (it is the base currency, or no exchange-rate provider is configured)`,
  });

export const ExchangeRateFrozenException = () =>
  httpError({
    code: ErrorCode.ExchangeRateFrozen,
    status: 422,
    message: "The exchange rate is frozen once a document is issued",
  });

export const DocumentCurrencyMismatchException = (currency: string, referencedCurrency: string) =>
  httpError({
    code: ErrorCode.DocumentCurrencyMismatch,
    status: 422,
    message: `A note must use its referenced document's currency (${referencedCurrency}), not ${currency}`,
  });

/** The base currency a manual rate converts into. Throws NOT_APPLICABLE without a provider or for base-currency documents. */
export async function manualRateBaseCurrency(
  money: MoneySettings,
  organizationId: string,
  currency: string,
): Promise<string> {
  const normalized = normalizeCurrency(currency);
  if (!money.exchangeRates) throw ExchangeRateNotApplicableException(normalized);
  const baseCurrency = normalizeCurrency(await money.exchangeRates.baseCurrency({ organizationId }));
  if (baseCurrency === normalized) throw ExchangeRateNotApplicableException(normalized);
  return baseCurrency;
}

/** The frozen exchange stored on a document, or null. */
export function exchangeOf(document: Document): DocumentExchange | null {
  if (
    document.exchangeRate === null ||
    document.baseCurrency === null ||
    document.exchangeRateDate === null ||
    document.exchangeRateSource === null
  ) {
    return null;
  }
  return {
    baseCurrency: document.baseCurrency,
    rate: document.exchangeRate,
    rateDate: document.exchangeRateDate,
    source: document.exchangeRateSource,
  };
}

/**
 * The exchange a document is issued at. Precedence: manual, referenced,
 * identity, provider. Null when the kit has no provider (feature off).
 */
export async function resolveIssueExchange(args: {
  money: MoneySettings;
  organizationId: string;
  currency: string;
  issueDate: Date;
  manualRate: DecimalString | null;
  referenced: DocumentExchange | null;
}): Promise<DocumentExchange | null> {
  const provider = args.money.exchangeRates;
  if (!provider) return null;
  const currency = normalizeCurrency(args.currency);
  const baseCurrency = normalizeCurrency(await provider.baseCurrency({ organizationId: args.organizationId }));
  if (args.manualRate !== null) {
    return { baseCurrency, rate: canonicalDecimal(args.manualRate), rateDate: args.issueDate, source: ExchangeRateSource.Manual };
  }
  if (args.referenced !== null) return { ...args.referenced, source: ExchangeRateSource.Referenced };
  if (currency === baseCurrency) {
    return { baseCurrency, rate: "1", rateDate: args.issueDate, source: ExchangeRateSource.Identity };
  }
  const resolved = await provider.resolve({
    organizationId: args.organizationId,
    from: currency,
    to: baseCurrency,
    date: args.issueDate,
  });
  if (resolved === null || parseScaled(resolved, EXCHANGE_RATE_SCALE) <= 0n) {
    throw ExchangeRateRequiredException(currency, args.issueDate);
  }
  return { baseCurrency, rate: canonicalDecimal(resolved), rateDate: args.issueDate, source: ExchangeRateSource.Provider };
}
```

- [ ] **Step 7: Run and confirm it passes**

Run: `bunx vitest run tests/unit/exchange.test.ts && bun run typecheck`
Expected: PASS.

---

### Task 5: One line builder; all document services compute under the policy

**Files:**
- Create: `src/lib/document-lines.ts`, `src/lib/document-issuance.ts`
- Modify: `src/domains/{invoices,quotes,notes,vendor-bills}/service.ts` (constructor and line computation only; exchange lifecycle in Tasks 6–9)
- Modify: `src/services.ts`, `src/create.ts`
- Delete: `src/lib/calculator.ts`, `src/lib/tax-strategy.ts`, `tests/unit/calculator.test.ts`, `tests/unit/tax-strategy.test.ts` (their cases now live in Task 2's legacy test)
- Test: `tests/unit/document-services-policy.test.ts`

**Interfaces:**
- Consumes: `calculateDocument`, `MoneySettings`, `buildMoneySettings`, `resolveLineItemProduct`, `LineItemInput`.
- Produces:

```ts
// src/lib/document-lines.ts
type DocumentLineInput = Pick<LineItemInput, "productId" | "source" | "quantity" | "price" | "description" | "metadata" | "taxIds">;
interface BuiltDocumentLines { lineItems: NewDocumentLineItem[]; totals: AmountTotals; base: AmountTotals | null }
function buildDocumentLines(args: {
  repos: Repositories; organizationId: string; currency: string; side: DocumentSide;
  lineItems: readonly DocumentLineInput[]; policy: MoneyPolicy; exchangeRate: DecimalString | null;
}): Promise<BuiltDocumentLines>
function lineInputsOf(document: DocumentWithRelations): DocumentLineInput[]

// src/lib/document-issuance.ts (this task: options type only; planner in Task 6)
interface DocumentServiceOptions { hooks?: InvoicingKitHooks; money?: MoneySettings; numbering?: DocumentNumberingService }

// src/services.ts
function buildServices(repos: Repositories, hooks?: InvoicingKitHooks, money?: MoneySettings): Services
```

- [ ] **Step 1: Write the failing test** — `tests/unit/document-services-policy.test.ts`

```ts
import { describe, expect, test } from "vitest";
import { inMemoryAdapter } from "../../src/adapters/memory";
import { buildServices } from "../../src/services";
import { buildMoneySettings } from "../../src/lib/money/settings";
import { RECOMMENDED_MONEY_POLICY } from "../../src/lib/money";
import type { AuthContext } from "../../src/auth/types";

async function setup(policy?: typeof RECOMMENDED_MONEY_POLICY) {
  const repos = inMemoryAdapter();
  const services = buildServices(repos, undefined, buildMoneySettings(policy ? { moneyPolicy: () => policy } : {}));
  const ctx: AuthContext = { userId: "u", organizationId: "org", role: null };
  const client = await repos.clients.create({ organizationId: "org", name: "Hotel" });
  const tax = await repos.taxes.create({ organizationId: "org", name: "ITBIS", type: "PERCENTAGE", rate: "0.18" });
  return { repos, services, ctx, client, tax };
}

const line = (price: string, taxIds: string[] = []) => ({
  source: { type: "experience", id: `x-${price}`, name: "Tour" },
  quantity: "1.5",
  price,
  taxIds,
});

describe("document services compute under the organization's policy", () => {
  test("legacy default keeps truncation", async () => {
    const { services, ctx, client } = await setup();
    const invoice = await services.invoices.create(
      { clientId: client.id, issueDate: "2026-09-25", status: "draft", lineItems: [line("333")], paymentMethodIds: [] } as any,
      ctx,
    );
    const full = await services.invoices.findById(invoice.id, ctx);
    expect(full.document.subtotal).toBe(499n);
  });

  test("recommended policy rounds half-up and taxes at document level", async () => {
    const { services, ctx, client, tax } = await setup(RECOMMENDED_MONEY_POLICY);
    const invoice = await services.invoices.create(
      {
        clientId: client.id,
        issueDate: "2026-09-25",
        status: "draft",
        lineItems: [line("333", [tax.id]), line("334", [tax.id])],
        paymentMethodIds: [],
      } as any,
      ctx,
    );
    const full = await services.invoices.findById(invoice.id, ctx);
    expect(full.document.subtotal).toBe(1001n); // 1.5 × 333 = 499.5 → 500; 1.5 × 334 = 501
    expect(full.document.tax).toBe(180n); // round(1001 × 18%) = round(180.18)
    expect(full.document.total).toBe(1181n);
  });

  test("quotes, notes and vendor bills use the same builder", async () => {
    const { repos, services, ctx, client } = await setup(RECOMMENDED_MONEY_POLICY);
    const quote = await services.quotes.create(
      { clientId: client.id, issueDate: "2026-09-25", status: "draft", lineItems: [line("333")], paymentMethodIds: [] } as any,
      ctx,
    );
    expect((await services.quotes.findById(quote.id, ctx)).document.subtotal).toBe(500n);

    const vendor = await repos.vendors.create({ organizationId: "org", name: "Fuel Co" });
    const bill = await services.vendorBills.create(
      {
        vendorId: vendor.id,
        issueDate: "2026-09-25",
        status: "draft",
        lineItems: [{ source: { type: "expense", id: "fuel", name: "Fuel" }, quantity: "1.5", price: "333", taxIds: [] }],
      } as any,
      ctx,
    );
    expect((await services.vendorBills.findById(bill.id, ctx)).document.subtotal).toBe(500n);
  });
});
```

- [ ] **Step 2: Run and confirm it fails**

Run: `bunx vitest run tests/unit/document-services-policy.test.ts`
Expected: FAIL. `buildServices` ignores the third argument, so the recommended-policy test gets the legacy `999n` subtotal instead of `1001n`.

- [ ] **Step 3: Line builder** — `src/lib/document-lines.ts`

```ts
import type { DocumentWithRelations, NewDocumentLineItem, Repositories } from "../adapters/types";
import type { DecimalString, DocumentSide, MoneyPolicy } from "../types";
import { normalizeCurrency } from "./currency";
import { resolveLineItemProduct, type LineItemInput } from "./line-item";
import { calculateDocument, type AmountTotals, type TaxDefinition } from "./money";

export type DocumentLineInput = Pick<
  LineItemInput,
  "productId" | "source" | "quantity" | "price" | "description" | "metadata" | "taxIds"
>;

export interface BuiltDocumentLines {
  lineItems: NewDocumentLineItem[];
  totals: AmountTotals;
  base: AmountTotals | null;
}

const unique = (values: readonly string[]) => [...new Set(values)];

/**
 * Resolves each line's product, loads its taxes and computes every amount with
 * `calculateDocument` under `policy` (and `exchangeRate` when given). The only
 * place document services turn request lines into stored lines.
 */
export async function buildDocumentLines(args: {
  repos: Repositories;
  organizationId: string;
  currency: string;
  side: DocumentSide;
  lineItems: readonly DocumentLineInput[];
  policy: MoneyPolicy;
  exchangeRate: DecimalString | null;
}): Promise<BuiltDocumentLines> {
  const currency = normalizeCurrency(args.currency);
  const products = [];
  for (const lineItem of args.lineItems) {
    products.push(await resolveLineItemProduct(args.repos, args.organizationId, lineItem, currency, args.side));
  }

  const taxIds = unique(args.lineItems.flatMap((lineItem) => lineItem.taxIds));
  const taxes = taxIds.length > 0 ? await args.repos.taxes.findManyById(taxIds, args.organizationId) : [];
  const taxById = new Map(taxes.map((tax) => [tax.id, tax]));
  const definitionsFor = (ids: readonly string[]): TaxDefinition[] =>
    unique(ids).flatMap((id) => {
      const tax = taxById.get(id);
      return tax ? [{ id: tax.id, type: tax.type, rate: tax.rate }] : [];
    });

  const calculation = calculateDocument({
    policy: args.policy,
    exchangeRate: args.exchangeRate,
    lines: args.lineItems.map((lineItem) => ({
      quantity: lineItem.quantity,
      price: BigInt(lineItem.price),
      taxes: definitionsFor(lineItem.taxIds),
    })),
  });

  const lineItems: NewDocumentLineItem[] = args.lineItems.map((lineItem, index) => {
    const line = calculation.lines[index]!;
    return {
      productId: products[index]!.id,
      quantity: lineItem.quantity,
      price: BigInt(lineItem.price),
      currency,
      description: lineItem.description ?? null,
      metadata: lineItem.metadata ?? null,
      taxes: line.taxes.map((tax) => ({ taxId: tax.taxId, taxAmount: tax.taxAmount, baseTaxAmount: tax.baseTaxAmount })),
      taxAmount: line.taxAmount,
      total: line.total,
      baseSubtotal: line.baseSubtotal,
    };
  });

  return {
    lineItems,
    totals: { subtotal: calculation.subtotal, tax: calculation.tax, total: calculation.total },
    base: calculation.base,
  };
}

/** Stored lines back as builder inputs, for recomputing a document without a new line list. */
export function lineInputsOf(document: DocumentWithRelations): DocumentLineInput[] {
  return document.lineItems.map((lineItem) => ({
    productId: lineItem.productId,
    quantity: lineItem.quantity,
    price: lineItem.price.toString(),
    description: lineItem.description,
    metadata: lineItem.metadata,
    taxIds: lineItem.taxes.map((tax) => tax.taxId),
  }));
}
```

- [ ] **Step 4: Service options** — create `src/lib/document-issuance.ts` with just the options type for now (Task 6 adds the planner):

```ts
import type { InvoicingKitHooks } from "../config";
import type { DocumentNumberingService } from "./numbering";
import type { MoneySettings } from "./money/settings";

export interface DocumentServiceOptions {
  hooks?: InvoicingKitHooks;
  money?: MoneySettings;
  numbering?: DocumentNumberingService;
}
```

- [ ] **Step 5: Migrate the four services.** Each one gets the same two changes.

**(a) Constructor.** Replace `constructor(private readonly repos, calc = new DocumentCalculator(), numbering = new DocumentNumberingService(), tax = new TaxStrategy(), hooks?)` with:

```ts
  private readonly hooks?: InvoicingKitHooks;
  private readonly money: MoneySettings;
  private readonly numbering: DocumentNumberingService;

  constructor(private readonly repos: Repositories, options: DocumentServiceOptions = {}) {
    this.hooks = options.hooks;
    this.money = options.money ?? buildMoneySettings();
    this.numbering = options.numbering ?? new DocumentNumberingService();
  }
```

`QuoteService` has no hooks; omit that field. Remove the `DocumentCalculator` / `TaxStrategy` imports. Import `buildMoneySettings`, `MoneySettings` from `../../lib/money/settings`, `DocumentServiceOptions` from `../../lib/document-issuance`, and `buildDocumentLines` from `../../lib/document-lines`.

**(b) Line computation.** In every `create` and `update`, replace the whole block below:

```ts
const lineItems = [];
for (const lineItem of body.lineItems) {
  /* resolveLineItemProduct, tax.computeForLine, calc.lineTotal, lineItems.push */
}
const docTotals = this.calc.documentTotals(/* … */);
```

with:

```ts
const policy = await this.money.policyFor(ctx.organizationId);
const built = await buildDocumentLines({
  repos: tx,
  organizationId: ctx.organizationId,
  currency: documentCurrency,
  side: DocumentSide.Sale, // Purchase for vendor bills; documentSide(docType) / documentSide(existing.document.type) for notes
  lineItems: body.lineItems,
  policy,
  exchangeRate: null,
});
```

Then use `built.lineItems` where `lineItems` was used, and `built.totals.subtotal / .tax / .total` where `docTotals.*` was used.

`policyFor` is awaited inside the transaction here. That's harmless (a consumer callback, no DB writes). Task 6 moves it before the transaction together with the rate.

- [ ] **Step 6: Wire settings through.** `src/services.ts`:

```ts
export function buildServices(repos: Repositories, hooks?: InvoicingKitHooks, money?: MoneySettings): Services {
  const settings = money ?? buildMoneySettings();
  return {
    // … unchanged services …
    quotes: new QuoteService(repos, { money: settings }),
    invoices: new InvoiceService(repos, { hooks, money: settings }),
    vendorBills: new VendorBillService(repos, { hooks, money: settings }),
    notes: new NoteService(repos, { hooks, money: settings }),
    // … unchanged …
  };
}
```

`src/create.ts`: `const services = buildServices(repos, config.hooks, buildMoneySettings(config));`

Delete `src/lib/calculator.ts`, `src/lib/tax-strategy.ts`, `tests/unit/calculator.test.ts` and `tests/unit/tax-strategy.test.ts`. Then run `grep -rn "calculator\|tax-strategy" src tests` and expect no hits.

- [ ] **Step 7: Run everything and confirm it passes**

Run: `bun run typecheck && bunx vitest run tests/unit && bunx vitest run tests/conformance tests/integration`
Expected:
- Typecheck clean.
- Unit: all pass, including the new file.
- DB suites: 360 + new conformance tests pass, with only the 11 baseline failures.

---

### Task 6: Invoice exchange lifecycle (planner, rate on create/update/bulk/convert, response fields)

**Files:**
- Modify: `src/lib/document-issuance.ts` (add planner + field mapper)
- Create: `src/lib/document-response.ts`
- Modify: `src/domains/invoices/{service,validation,mappers}.ts`
- Test: `tests/unit/invoice-exchange.test.ts`

**Interfaces:**
- Consumes: `resolveIssueExchange`, `exchangeOf`, `manualRateBaseCurrency`, `ExchangeRateFrozenException`, `buildDocumentLines`, `lineInputsOf`, `LEGACY_MONEY_POLICY`.
- Produces:

```ts
interface DocumentWritePlan {
  policy: MoneyPolicy; issuing: boolean; frozen: boolean;
  exchange: DocumentExchange | null;
  draftRate: { baseCurrency: string; rate: DecimalString } | null;
}
function planDocumentWrite(args: {
  money: MoneySettings; organizationId: string; existing: Document | null; existingIsDraft: boolean;
  willBeDraft: boolean; currency: string; issueDate: Date; requestedRate: DecimalString | null | undefined;
  referenced?: { exchange: DocumentExchange | null; policy: MoneyPolicy | null };
}): Promise<DocumentWritePlan>
function documentMoneyFields(plan: DocumentWritePlan, base: AmountTotals | null): DocumentMoneyFields
// src/lib/document-response.ts
const documentMoneyResponseFields: ZodRawShape
function documentMoneyToResponse(document: Document): {...}
function lineItemBaseToResponse(lineItem): { baseSubtotal: string | null }
function lineItemTaxBaseToResponse(tax): { baseTaxAmount: string | null }
```

- [ ] **Step 1: Write the failing test** — `tests/unit/invoice-exchange.test.ts`

```ts
import { beforeEach, describe, expect, test } from "vitest";
import { inMemoryAdapter } from "../../src/adapters/memory";
import { buildServices } from "../../src/services";
import { buildMoneySettings } from "../../src/lib/money/settings";
import { RECOMMENDED_MONEY_POLICY } from "../../src/lib/money";
import { ExchangeRateSource, InvoiceStatus } from "../../src/types";
import type { AuthContext } from "../../src/auth/types";

let rates: Record<string, string | null>;
let providerCalls: number;
const ctx: AuthContext = { userId: "u", organizationId: "org", role: null };

async function setup(options: { provider?: boolean } = { provider: true }) {
  const repos = inMemoryAdapter();
  const money = buildMoneySettings({
    moneyPolicy: () => RECOMMENDED_MONEY_POLICY,
    exchangeRates: options.provider
      ? {
          baseCurrency: () => "dop",
          resolve: async ({ date }) => {
            providerCalls++;
            return rates[date.toISOString().slice(0, 10)] ?? null;
          },
        }
      : undefined,
  });
  const services = buildServices(repos, undefined, money);
  const client = await repos.clients.create({ organizationId: "org", name: "Hotel" });
  const tax = await repos.taxes.create({ organizationId: "org", name: "ITBIS", type: "PERCENTAGE", rate: "0.18" });
  const body = (overrides: Record<string, unknown> = {}) =>
    ({
      clientId: client.id,
      issueDate: "2026-09-25",
      currency: "usd",
      status: InvoiceStatus.Draft,
      paymentMethodIds: [],
      lineItems: [{ source: { type: "experience", id: "tour", name: "Tour" }, quantity: "1", price: "100000", taxIds: [tax.id] }],
      ...overrides,
    }) as any;
  return { repos, services, body };
}

beforeEach(() => {
  rates = { "2026-09-25": "59.3470" };
  providerCalls = 0;
});

describe("invoice exchange lifecycle", () => {
  test("a draft saves without any rate", async () => {
    rates = {};
    const { services, body } = await setup();
    const invoice = await services.invoices.create(body(), ctx);
    const full = await services.invoices.findById(invoice.id, ctx);
    expect(full.status).toBe(InvoiceStatus.Draft);
    expect(full.document.exchangeRate).toBeNull();
    expect(full.document.baseTotal).toBeNull();
    expect(full.document.moneyPolicy).toBeNull();
  });

  test("issuing freezes the provider rate, the policy and the base amounts", async () => {
    const { services, body } = await setup();
    const invoice = await services.invoices.create(body({ status: InvoiceStatus.Sent }), ctx);
    const doc = (await services.invoices.findById(invoice.id, ctx)).document;
    expect(doc.exchangeRate).toBe("59.347");
    expect(doc.exchangeRateSource).toBe(ExchangeRateSource.Provider);
    expect(doc.baseCurrency).toBe("dop");
    expect(doc.moneyPolicy).toEqual(RECOMMENDED_MONEY_POLICY);
    expect([doc.baseSubtotal, doc.baseTax, doc.baseTotal]).toEqual([5_934_700n, 1_068_246n, 7_002_946n]);
    expect(doc.lineItems[0]!.baseSubtotal).toBe(5_934_700n);
  });

  test("issuing without a rate is 422 and the invoice stays a draft", async () => {
    rates = {};
    const { services, body } = await setup();
    await expect(services.invoices.create(body({ status: InvoiceStatus.Sent }), ctx)).rejects.toThrow(/EXCHANGE_RATE_REQUIRED/);
    const draft = await services.invoices.create(body(), ctx);
    await expect(services.invoices.update(draft.id, { status: InvoiceStatus.Sent } as any, ctx)).rejects.toThrow(/EXCHANGE_RATE_REQUIRED/);
    expect((await services.invoices.findById(draft.id, ctx)).status).toBe(InvoiceStatus.Draft);
  });

  test("a partner's own rate on the draft wins at issue", async () => {
    const { services, body } = await setup();
    const draft = await services.invoices.create(body({ exchangeRate: "60.5" }), ctx);
    expect((await services.invoices.findById(draft.id, ctx)).document.exchangeRateSource).toBe(ExchangeRateSource.Manual);
    await services.invoices.update(draft.id, { status: InvoiceStatus.Sent } as any, ctx);
    const doc = (await services.invoices.findById(draft.id, ctx)).document;
    expect(doc.exchangeRate).toBe("60.5");
    expect(doc.exchangeRateSource).toBe(ExchangeRateSource.Manual);
    expect(providerCalls).toBe(0);
  });

  test("clearing the draft's rate falls back to the provider", async () => {
    const { services, body } = await setup();
    const draft = await services.invoices.create(body({ exchangeRate: "60.5" }), ctx);
    await services.invoices.update(draft.id, { exchangeRate: null, status: InvoiceStatus.Sent } as any, ctx);
    expect((await services.invoices.findById(draft.id, ctx)).document.exchangeRate).toBe("59.347");
  });

  test("base-currency invoices get the identity rate; manual rates are not applicable", async () => {
    const { services, body } = await setup();
    const dop = await services.invoices.create(body({ currency: "dop", status: InvoiceStatus.Sent }), ctx);
    const doc = (await services.invoices.findById(dop.id, ctx)).document;
    expect(doc.exchangeRate).toBe("1");
    expect(doc.baseTotal).toBe(doc.total);
    await expect(services.invoices.create(body({ currency: "dop", exchangeRate: "2" }), ctx)).rejects.toThrow(/EXCHANGE_RATE_NOT_APPLICABLE/);
  });

  test("after issue the rate is frozen: edits are rejected, line changes reuse it", async () => {
    const { services, body } = await setup();
    const invoice = await services.invoices.create(body({ status: InvoiceStatus.Sent }), ctx);
    await expect(services.invoices.update(invoice.id, { exchangeRate: "61" } as any, ctx)).rejects.toThrow(/EXCHANGE_RATE_FROZEN/);
    rates["2026-09-25"] = "70";
    await services.invoices.update(
      invoice.id,
      { lineItems: [{ source: { type: "experience", id: "tour", name: "Tour" }, quantity: "2", price: "100000", taxIds: [] }] } as any,
      ctx,
    );
    const doc = (await services.invoices.findById(invoice.id, ctx)).document;
    expect(doc.exchangeRate).toBe("59.347");
    expect(doc.baseSubtotal).toBe(11_869_400n);
  });

  test("an issued invoice set back to draft and re-issued keeps its frozen rate", async () => {
    const { services, body } = await setup();
    const invoice = await services.invoices.create(body({ status: InvoiceStatus.Sent }), ctx);
    await services.invoices.update(invoice.id, { status: InvoiceStatus.Draft } as any, ctx);
    rates["2026-09-25"] = "70";
    await services.invoices.update(invoice.id, { status: InvoiceStatus.Sent } as any, ctx);
    expect((await services.invoices.findById(invoice.id, ctx)).document.exchangeRate).toBe("59.347");
  });

  test("a provider rate with trailing zeros is stored canonical; one with 9 decimals fails and keeps the draft", async () => {
    rates["2026-09-25"] = "59.34700000";
    const { services, body } = await setup();
    const ok = await services.invoices.create(body({ status: InvoiceStatus.Sent }), ctx);
    expect((await services.invoices.findById(ok.id, ctx)).document.exchangeRate).toBe("59.347");
    rates["2026-09-25"] = "59.123456789";
    const draft = await services.invoices.create(body(), ctx);
    await expect(services.invoices.update(draft.id, { status: InvoiceStatus.Sent } as any, ctx)).rejects.toThrow(RangeError);
    expect((await services.invoices.findById(draft.id, ctx)).status).toBe(InvoiceStatus.Draft);
  });

  test("bulk issue with one missing rate changes nothing", async () => {
    const { services, body } = await setup();
    const a = await services.invoices.create(body(), ctx);
    const b = await services.invoices.create(body({ issueDate: "2026-09-26" }), ctx);
    await expect(services.invoices.bulkUpdateStatus([a.id, b.id], InvoiceStatus.Sent, ctx)).rejects.toThrow(/EXCHANGE_RATE_REQUIRED/);
    expect((await services.invoices.findById(a.id, ctx)).status).toBe(InvoiceStatus.Draft);
    expect((await services.invoices.findById(b.id, ctx)).status).toBe(InvoiceStatus.Draft);
  });

  test("without a provider, issuing works and carries no rate (backward compatible)", async () => {
    const { services, body } = await setup({ provider: false });
    const invoice = await services.invoices.create(body({ status: InvoiceStatus.Sent }), ctx);
    const doc = (await services.invoices.findById(invoice.id, ctx)).document;
    expect(doc.exchangeRate).toBeNull();
    expect(doc.moneyPolicy).toEqual(RECOMMENDED_MONEY_POLICY);
    await expect(services.invoices.create(body({ exchangeRate: "59" }), ctx)).rejects.toThrow(/EXCHANGE_RATE_NOT_APPLICABLE/);
  });
});
```

- [ ] **Step 2: Run and confirm it fails**

Run: `bunx vitest run tests/unit/invoice-exchange.test.ts`
Expected: FAIL. `exchangeRate` stays `null` after issuing, and `exchangeRate` in the body is ignored.

- [ ] **Step 3: Planner and field mapper.** Append to `src/lib/document-issuance.ts`:

```ts
import type { DecimalString, Document, MoneyPolicy } from "../types";
import { ExchangeRateSource } from "../types";
import type { AmountTotals } from "./money/calculate";
import { LEGACY_MONEY_POLICY } from "./money/policy";
import {
  ExchangeRateFrozenException,
  exchangeOf,
  manualRateBaseCurrency,
  resolveIssueExchange,
  type DocumentExchange,
} from "./exchange";

export interface DocumentWritePlan {
  /** Policy the amounts are computed under. */
  policy: MoneyPolicy;
  /** This write is the document's first issue: policy and rate get frozen. */
  issuing: boolean;
  /** Policy and rate were frozen before this write (issued under 0.17+, or issued before 0.17). */
  frozen: boolean;
  /** Rate the base amounts are computed with; null when none applies. */
  exchange: DocumentExchange | null;
  /** A draft's manual rate: stored, not yet converted with. */
  draftRate: { baseCurrency: string; rate: DecimalString } | null;
}

export interface PlanDocumentWriteArgs {
  money: MoneySettings;
  organizationId: string;
  /** Stored document on update; null on create. */
  existing: Document | null;
  /** Whether the stored sidecar status is draft (true on create). */
  existingIsDraft: boolean;
  /** Whether the document is a draft after this write. */
  willBeDraft: boolean;
  currency: string;
  issueDate: Date;
  /** Request body `exchangeRate`: undefined = not sent, null = clear. */
  requestedRate: DecimalString | null | undefined;
  /** Notes: the referenced document's frozen rate and policy. */
  referenced?: { exchange: DocumentExchange | null; policy: MoneyPolicy | null };
}

function storedManualRate(document: Document | null): DecimalString | null {
  return document?.exchangeRateSource === ExchangeRateSource.Manual ? document.exchangeRate : null;
}

/** Decides the policy and rate for one document write. Call before opening the write transaction. */
export async function planDocumentWrite(args: PlanDocumentWriteArgs): Promise<DocumentWritePlan> {
  const existing = args.existing;
  if (existing !== null && (existing.moneyPolicy !== null || !args.existingIsDraft)) {
    if (args.requestedRate !== undefined) throw ExchangeRateFrozenException();
    return {
      policy: existing.moneyPolicy ?? LEGACY_MONEY_POLICY,
      issuing: false,
      frozen: true,
      exchange: exchangeOf(existing),
      draftRate: null,
    };
  }

  const manualRate = args.requestedRate !== undefined ? args.requestedRate : storedManualRate(existing);
  const draftRate =
    manualRate === null
      ? null
      : { baseCurrency: await manualRateBaseCurrency(args.money, args.organizationId, args.currency), rate: manualRate };
  const policy = args.referenced?.policy ?? (await args.money.policyFor(args.organizationId));
  if (args.willBeDraft) return { policy, issuing: false, frozen: false, exchange: null, draftRate };

  const exchange = await resolveIssueExchange({
    money: args.money,
    organizationId: args.organizationId,
    currency: args.currency,
    issueDate: args.issueDate,
    manualRate: draftRate?.rate ?? null,
    referenced: args.referenced?.exchange ?? null,
  });
  return { policy, issuing: true, frozen: false, exchange, draftRate: null };
}

export interface DocumentMoneyFields {
  moneyPolicy?: MoneyPolicy | null;
  baseCurrency?: string | null;
  exchangeRate?: DecimalString | null;
  exchangeRateDate?: Date | null;
  exchangeRateSource?: ExchangeRateSource | null;
  baseSubtotal?: bigint | null;
  baseTax?: bigint | null;
  baseTotal?: bigint | null;
}

/** The money fields a write stores. `base` is the recomputed calculation's base totals. */
export function documentMoneyFields(plan: DocumentWritePlan, base: AmountTotals | null): DocumentMoneyFields {
  const baseAmounts = { baseSubtotal: base?.subtotal ?? null, baseTax: base?.tax ?? null, baseTotal: base?.total ?? null };
  if (plan.frozen) return baseAmounts;
  if (plan.issuing) {
    return {
      moneyPolicy: plan.policy,
      baseCurrency: plan.exchange?.baseCurrency ?? null,
      exchangeRate: plan.exchange?.rate ?? null,
      exchangeRateDate: plan.exchange?.rateDate ?? null,
      exchangeRateSource: plan.exchange?.source ?? null,
      ...baseAmounts,
    };
  }
  return {
    moneyPolicy: null,
    baseCurrency: plan.draftRate?.baseCurrency ?? null,
    exchangeRate: plan.draftRate?.rate ?? null,
    exchangeRateDate: null,
    exchangeRateSource: plan.draftRate ? ExchangeRateSource.Manual : null,
    baseSubtotal: null,
    baseTax: null,
    baseTotal: null,
  };
}
```

Merge the imports with the ones Task 5 put at the top of the file. `MoneySettings` is already imported as a type.

- [ ] **Step 4: Shared response pieces** — `src/lib/document-response.ts`

```ts
import { z } from "zod";
import type { Document, DocumentLineItem, DocumentLineItemTax } from "../types";
import { BaseTaxMethod, ExchangeRateSource, RoundingMode, TaxLevel } from "../types";

const isoDate = (date: Date | null) => (date ? date.toISOString().slice(0, 10) : null);
const minor = (value: bigint | null) => (value !== null ? value.toString() : null);

export const documentMoneyResponseFields = {
  moneyPolicy: z
    .object({
      rounding: z.nativeEnum(RoundingMode),
      taxLevel: z.nativeEnum(TaxLevel),
      baseTaxMethod: z.nativeEnum(BaseTaxMethod),
    })
    .nullable(),
  baseCurrency: z.string().nullable(),
  exchangeRate: z.string().nullable(),
  exchangeRateDate: z.string().nullable(),
  exchangeRateSource: z.nativeEnum(ExchangeRateSource).nullable(),
  baseSubtotal: z.string().nullable(),
  baseTax: z.string().nullable(),
  baseTotal: z.string().nullable(),
};

export function documentMoneyToResponse(document: Document) {
  return {
    moneyPolicy: document.moneyPolicy,
    baseCurrency: document.baseCurrency,
    exchangeRate: document.exchangeRate,
    exchangeRateDate: isoDate(document.exchangeRateDate),
    exchangeRateSource: document.exchangeRateSource,
    baseSubtotal: minor(document.baseSubtotal),
    baseTax: minor(document.baseTax),
    baseTotal: minor(document.baseTotal),
  };
}

export const lineItemBaseResponseFields = { baseSubtotal: z.string().nullable() };
export const lineItemTaxBaseResponseFields = { baseTaxAmount: z.string().nullable() };

export function lineItemBaseToResponse(lineItem: Pick<DocumentLineItem, "baseSubtotal">) {
  return { baseSubtotal: minor(lineItem.baseSubtotal) };
}

export function lineItemTaxBaseToResponse(tax: Pick<DocumentLineItemTax, "baseTaxAmount">) {
  return { baseTaxAmount: minor(tax.baseTaxAmount) };
}
```

- [ ] **Step 5: Invoice validation and response** (`src/domains/invoices/validation.ts`).
  - Import `exchangeRateSchema` from `../../lib/exchange` and the three field objects from `../../lib/document-response`.
  - Add `exchangeRate: exchangeRateSchema.optional().nullable(),` to both `createInvoiceBody` and `updateInvoiceBody`.
  - In `lineItemResponse`: spread `...lineItemBaseResponseFields` into the object, and change the taxes item to `z.object({ id: z.string(), taxId: z.string(), taxAmount: z.string(), ...lineItemTaxBaseResponseFields })`.
  - In `invoiceResponse.document`: spread `...documentMoneyResponseFields`.

  In `src/domains/invoices/mappers.ts`:
  - `lineItemToResponse`: add `...lineItemBaseToResponse(lineItem),`, and add `...lineItemTaxBaseToResponse(tax)` to each tax.
  - `documentToResponse`: add `...documentMoneyToResponse(doc),`.

- [ ] **Step 6: Invoice service.** Replace `create`, `update`, `bulkUpdateStatus` and `convertFromQuote` in `src/domains/invoices/service.ts` with:

```ts
  async create(body: CreateInvoiceBody, ctx: AuthContext): Promise<Invoice> {
    const currency = normalizeCurrency(body.currency ?? DEFAULT_CURRENCY);
    const issueDate = new Date(body.issueDate);
    const plan = await planDocumentWrite({
      money: this.money,
      organizationId: ctx.organizationId,
      existing: null,
      existingIsDraft: true,
      willBeDraft: body.status === InvoiceStatus.Draft,
      currency,
      issueDate,
      requestedRate: body.exchangeRate,
    });

    const invoice = await this.repos.tx(async (tx) => {
      const resolvedPrefix = body.documentNumberPrefix ?? null;
      const number =
        body.documentNumber ??
        (await this.numbering.next(tx, ctx.organizationId, DocumentType.Invoice, resolvedPrefix));
      const existing = await tx.invoices.findByDocumentNumber({
        organizationId: ctx.organizationId,
        prefix: resolvedPrefix,
        documentNumber: number,
      });
      if (existing) throw InvoiceNumberAlreadyExistsException();

      const built = await buildDocumentLines({
        repos: tx,
        organizationId: ctx.organizationId,
        currency,
        side: DocumentSide.Sale,
        lineItems: body.lineItems,
        policy: plan.policy,
        exchangeRate: plan.exchange?.rate ?? null,
      });

      const doc = await tx.documents.create({
        type: DocumentType.Invoice,
        organizationId: ctx.organizationId,
        clientId: body.clientId,
        documentNumberPrefix: resolvedPrefix,
        documentNumber: number,
        issueDate,
        notes: body.notes ?? null,
        currency,
        ...built.totals,
        lineItems: built.lineItems,
        paymentMethodIds: body.paymentMethodIds,
        ...documentMoneyFields(plan, built.base),
      });

      let paidDate: Date | null = body.paidDate ? new Date(body.paidDate) : null;
      if (body.status === InvoiceStatus.Paid && paidDate === null) paidDate = new Date();

      return tx.invoices.create({ documentId: doc.id, status: body.status, paidDate, convertedFromQuoteId: null });
    });

    if (invoice.status !== InvoiceStatus.Draft) await this.emitIssued(ctx.organizationId, invoice.id);
    return invoice;
  }

  async update(id: string, body: UpdateInvoiceBody, ctx: AuthContext): Promise<Invoice> {
    const current = await this.repos.invoices.findById(id, ctx.organizationId);
    if (!current) throw InvoiceNotFoundException();
    const plan = await planDocumentWrite({
      money: this.money,
      organizationId: ctx.organizationId,
      existing: current.document,
      existingIsDraft: current.status === InvoiceStatus.Draft,
      willBeDraft: (body.status ?? current.status) === InvoiceStatus.Draft,
      currency: current.document.currency,
      issueDate: body.issueDate ? new Date(body.issueDate) : current.document.issueDate,
      requestedRate: body.exchangeRate,
    });

    const { updated, wasDraft } = await this.repos.tx(async (tx) => {
      const existing = await tx.invoices.findById(id, ctx.organizationId);
      if (!existing) throw InvoiceNotFoundException();
      const wasDraft = existing.status === InvoiceStatus.Draft;

      const invoiceUpdate: { status?: InvoiceStatus; paidDate?: Date | null } = {};
      if (body.status !== undefined) invoiceUpdate.status = body.status;
      if (body.paidDate !== undefined) invoiceUpdate.paidDate = body.paidDate ? new Date(body.paidDate) : null;
      if (body.status === InvoiceStatus.Paid && body.paidDate === undefined && existing.paidDate === null) {
        invoiceUpdate.paidDate = new Date();
      }

      let updated: Invoice = existing;
      if (Object.keys(invoiceUpdate).length > 0) {
        const patched = await tx.invoices.update(id, ctx.organizationId, invoiceUpdate);
        updated = { ...existing, ...patched };
      }

      const documentUpdate: DocumentUpdate = {};
      if (body.clientId !== undefined) documentUpdate.clientId = body.clientId;
      if (body.documentNumberPrefix !== undefined) documentUpdate.documentNumberPrefix = body.documentNumberPrefix;
      if (body.documentNumber !== undefined) documentUpdate.documentNumber = body.documentNumber;
      if (body.issueDate !== undefined) documentUpdate.issueDate = new Date(body.issueDate);
      if (body.notes !== undefined) documentUpdate.notes = body.notes;

      // Unfrozen documents (drafts) follow the current policy on every write;
      // frozen ones recompute only when their lines change, at their frozen rate.
      if (body.lineItems !== undefined || !plan.frozen) {
        const built = await buildDocumentLines({
          repos: tx,
          organizationId: ctx.organizationId,
          currency: existing.document.currency,
          side: DocumentSide.Sale,
          lineItems: body.lineItems ?? lineInputsOf(existing.document),
          policy: plan.policy,
          exchangeRate: plan.exchange?.rate ?? null,
        });
        Object.assign(documentUpdate, built.totals, documentMoneyFields(plan, built.base));
        await tx.documents.replaceLineItems(existing.documentId, ctx.organizationId, built.lineItems);
      }

      if (body.paymentMethodIds !== undefined) {
        await tx.documents.setPaymentMethods(existing.documentId, ctx.organizationId, body.paymentMethodIds);
      }
      if (Object.keys(documentUpdate).length > 0) {
        await tx.documents.update(existing.documentId, ctx.organizationId, documentUpdate);
      }
      return { updated, wasDraft };
    });

    if (wasDraft && updated.status !== InvoiceStatus.Draft) await this.emitIssued(ctx.organizationId, updated.id);
    return updated;
  }

  async bulkUpdateStatus(ids: string[], status: InvoiceStatus, ctx: AuthContext): Promise<{ count: number }> {
    // Plan every first issue before writing, so one missing rate fails the whole batch and changes nothing.
    const issuePlans = new Map<string, DocumentWritePlan>();
    if (status !== InvoiceStatus.Draft) {
      for (const id of ids) {
        const invoice = await this.repos.invoices.findById(id, ctx.organizationId);
        if (!invoice || invoice.status !== InvoiceStatus.Draft) continue;
        const plan = await planDocumentWrite({
          money: this.money,
          organizationId: ctx.organizationId,
          existing: invoice.document,
          existingIsDraft: true,
          willBeDraft: false,
          currency: invoice.document.currency,
          issueDate: invoice.document.issueDate,
          requestedRate: undefined,
        });
        if (plan.issuing) issuePlans.set(id, plan);
      }
    }

    let count = 0;
    const issuedIds: string[] = [];
    await this.repos.tx(async (tx) => {
      for (const id of ids) {
        const invoice = await tx.invoices.findById(id, ctx.organizationId);
        if (!invoice) continue;
        const patch: { status: InvoiceStatus; paidDate?: Date | null } = { status };
        if (status === InvoiceStatus.Paid && invoice.paidDate === null) patch.paidDate = new Date();
        await tx.invoices.update(id, ctx.organizationId, patch);
        const plan = issuePlans.get(id);
        if (plan) await this.freezeAtIssue(tx, invoice, plan, ctx.organizationId);
        if (invoice.status === InvoiceStatus.Draft && status !== InvoiceStatus.Draft) issuedIds.push(id);
        count++;
      }
    });

    for (const id of issuedIds) await this.emitIssued(ctx.organizationId, id);
    return { count };
  }

  /** Recomputes a draft's lines under its issue plan and stores the frozen policy, rate and base amounts. */
  private async freezeAtIssue(
    tx: Repositories,
    invoice: InvoiceWithDocument,
    plan: DocumentWritePlan,
    organizationId: string,
  ): Promise<void> {
    const built = await buildDocumentLines({
      repos: tx,
      organizationId,
      currency: invoice.document.currency,
      side: DocumentSide.Sale,
      lineItems: lineInputsOf(invoice.document),
      policy: plan.policy,
      exchangeRate: plan.exchange?.rate ?? null,
    });
    await tx.documents.replaceLineItems(invoice.documentId, organizationId, built.lineItems);
    await tx.documents.update(invoice.documentId, organizationId, {
      ...built.totals,
      ...documentMoneyFields(plan, built.base),
    });
  }

  async convertFromQuote(quoteId: string, body: ConvertFromQuoteBody, ctx: AuthContext): Promise<Invoice> {
    const quote = await this.repos.quotes.findById(quoteId, ctx.organizationId);
    if (!quote) throw QuoteNotFoundException();
    // The quote's agreed (manual) rate carries over to the invoice draft.
    const quotedRate =
      quote.document.exchangeRateSource === ExchangeRateSource.Manual ? quote.document.exchangeRate : undefined;
    const plan = await planDocumentWrite({
      money: this.money,
      organizationId: ctx.organizationId,
      existing: null,
      existingIsDraft: true,
      willBeDraft: true,
      currency: quote.document.currency,
      issueDate: new Date(),
      requestedRate: quotedRate ?? undefined,
    });

    return this.repos.tx(async (tx) => {
      const current = await tx.quotes.findById(quoteId, ctx.organizationId);
      if (!current) throw QuoteNotFoundException();
      if (current.status === QuoteStatus.Converted) throw QuoteAlreadyConvertedException();

      const number = await this.numbering.next(tx, ctx.organizationId, DocumentType.Invoice, null);
      const built = await buildDocumentLines({
        repos: tx,
        organizationId: ctx.organizationId,
        currency: current.document.currency,
        side: DocumentSide.Sale,
        lineItems: lineInputsOf(current.document),
        policy: plan.policy,
        exchangeRate: null,
      });

      const doc = await tx.documents.create({
        type: DocumentType.Invoice,
        organizationId: ctx.organizationId,
        clientId: current.document.clientId,
        documentNumberPrefix: null,
        documentNumber: number,
        issueDate: new Date(),
        notes: current.document.notes,
        currency: current.document.currency,
        ...built.totals,
        lineItems: built.lineItems,
        paymentMethodIds: body.paymentMethodIds ?? [],
        ...documentMoneyFields(plan, built.base),
      });

      const invoice = await tx.invoices.create({
        documentId: doc.id,
        status: InvoiceStatus.Draft,
        paidDate: null,
        convertedFromQuoteId: current.id,
      });
      await tx.quotes.update(current.id, ctx.organizationId, { status: QuoteStatus.Converted });
      return invoice;
    });
  }
```

Imports to add:
- `DocumentUpdate` and `InvoiceWithDocument` (types) from `../../adapters/types`
- `ExchangeRateSource` from `../../types`
- `planDocumentWrite`, `documentMoneyFields`, and the `DocumentWritePlan` type from `../../lib/document-issuance`
- `lineInputsOf` from `../../lib/document-lines`

- [ ] **Step 7: Run and confirm it passes**

Run: `bunx vitest run tests/unit && bun run typecheck && bunx vitest run tests/conformance tests/integration`
Expected: all new tests pass, and only the 11 baseline failures remain. An existing integration test that snapshots the full invoice JSON may need the new `null` fields added to its expected object. That is an additive response change; update the expectation, and don't loosen it.

---

### Task 7: Vendor bill exchange lifecycle

**Files:**
- Modify: `src/domains/vendor-bills/{service,validation,mappers}.ts`
- Test: `tests/unit/vendor-bill-exchange.test.ts`

**Interfaces:**
- Consumes: `planDocumentWrite`, `documentMoneyFields`, `buildDocumentLines`, `lineInputsOf`, `exchangeRateSchema`, and the response helpers (Task 6).

- [ ] **Step 1: Write the failing test** — `tests/unit/vendor-bill-exchange.test.ts`

```ts
import { describe, expect, test } from "vitest";
import { inMemoryAdapter } from "../../src/adapters/memory";
import { buildServices } from "../../src/services";
import { buildMoneySettings } from "../../src/lib/money/settings";
import { RECOMMENDED_MONEY_POLICY } from "../../src/lib/money";
import { ExchangeRateSource, VendorBillStatus } from "../../src/types";
import type { AuthContext } from "../../src/auth/types";

const ctx: AuthContext = { userId: "u", organizationId: "org", role: null };

async function setup(rate: string | null) {
  const repos = inMemoryAdapter();
  const services = buildServices(
    repos,
    undefined,
    buildMoneySettings({
      moneyPolicy: () => RECOMMENDED_MONEY_POLICY,
      exchangeRates: { baseCurrency: () => "dop", resolve: async () => rate },
    }),
  );
  const vendor = await repos.vendors.create({ organizationId: "org", name: "Fuel Co" });
  const body = (overrides: Record<string, unknown> = {}) =>
    ({
      vendorId: vendor.id,
      issueDate: "2026-09-20",
      currency: "usd",
      status: VendorBillStatus.Draft,
      lineItems: [{ source: { type: "expense", id: "fuel", name: "Fuel" }, quantity: "1", price: "5000", taxIds: [] }],
      ...overrides,
    }) as any;
  return { services, body };
}

describe("vendor bill exchange lifecycle", () => {
  test("recording a bill freezes the rate of the supplier's invoice date", async () => {
    const { services, body } = await setup("59.1");
    const bill = await services.vendorBills.create(body({ status: VendorBillStatus.Received }), ctx);
    const doc = (await services.vendorBills.findById(bill.id, ctx)).document;
    expect(doc.exchangeRate).toBe("59.1");
    expect(doc.baseSubtotal).toBe(295_500n);
  });

  test("draft saves without a rate; recording without one is 422", async () => {
    const { services, body } = await setup(null);
    const draft = await services.vendorBills.create(body(), ctx);
    await expect(
      services.vendorBills.update(draft.id, { status: VendorBillStatus.Received } as any, ctx),
    ).rejects.toThrow(/EXCHANGE_RATE_REQUIRED/);
  });

  test("the partner's own rate is used", async () => {
    const { services, body } = await setup("59.1");
    const bill = await services.vendorBills.create(body({ status: VendorBillStatus.Received, exchangeRate: "60" }), ctx);
    const doc = (await services.vendorBills.findById(bill.id, ctx)).document;
    expect(doc.exchangeRateSource).toBe(ExchangeRateSource.Manual);
    expect(doc.baseSubtotal).toBe(300_000n);
  });
});
```

- [ ] **Step 2: Run and confirm it fails**

Run: `bunx vitest run tests/unit/vendor-bill-exchange.test.ts`
Expected: FAIL. `exchangeRate` is null after the bill is recorded.

- [ ] **Step 3: Validation and mappers.**
  - Add `exchangeRate: exchangeRateSchema.optional().nullable(),` to `createVendorBillBody` and `updateVendorBillBody`.
  - In `lineItemResponse`, spread `...lineItemBaseResponseFields`, and spread `...lineItemTaxBaseResponseFields` into its tax object.
  - In `vendorBillResponse.document`, spread `...documentMoneyResponseFields`.
  - Mappers: `lineItemToResponse` gets `...lineItemBaseToResponse(lineItem)` and `...lineItemTaxBaseToResponse(tax)`; `documentToResponse` gets `...documentMoneyToResponse(doc)`.

- [ ] **Step 4: Service.** Replace `create` and `update` in `src/domains/vendor-bills/service.ts`:

```ts
  async create(body: CreateVendorBillBody, ctx: AuthContext): Promise<VendorBill> {
    const currency = normalizeCurrency(body.currency ?? DEFAULT_CURRENCY);
    const issueDate = new Date(body.issueDate);
    const plan = await planDocumentWrite({
      money: this.money,
      organizationId: ctx.organizationId,
      existing: null,
      existingIsDraft: true,
      willBeDraft: body.status === VendorBillStatus.Draft,
      currency,
      issueDate,
      requestedRate: body.exchangeRate,
    });

    const bill = await this.repos.tx(async (tx) => {
      const vendor = await tx.vendors.findById(body.vendorId, ctx.organizationId);
      if (!vendor) throw VendorNotFoundException();
      const number = await this.numbering.next(tx, ctx.organizationId, DocumentType.VendorBill, null);

      const built = await buildDocumentLines({
        repos: tx,
        organizationId: ctx.organizationId,
        currency,
        side: DocumentSide.Purchase,
        lineItems: body.lineItems,
        policy: plan.policy,
        exchangeRate: plan.exchange?.rate ?? null,
      });

      const doc = await tx.documents.create({
        type: DocumentType.VendorBill,
        organizationId: ctx.organizationId,
        clientId: null,
        vendorId: body.vendorId,
        externalDocumentNumber: body.externalDocumentNumber ?? null,
        documentNumberPrefix: null,
        documentNumber: number,
        issueDate,
        dueDate: body.dueDate ? new Date(body.dueDate) : null,
        notes: body.notes ?? null,
        currency,
        ...built.totals,
        lineItems: built.lineItems,
        ...documentMoneyFields(plan, built.base),
      });
      return tx.vendorBills.create({ documentId: doc.id, status: body.status });
    });

    if (bill.status !== VendorBillStatus.Draft) await this.emitRecorded(ctx.organizationId, bill.id);
    return bill;
  }

  async update(id: string, body: UpdateVendorBillBody, ctx: AuthContext): Promise<VendorBill> {
    const current = await this.repos.vendorBills.findById(id, ctx.organizationId);
    if (!current) throw VendorBillNotFoundException();
    const plan = await planDocumentWrite({
      money: this.money,
      organizationId: ctx.organizationId,
      existing: current.document,
      existingIsDraft: current.status === VendorBillStatus.Draft,
      willBeDraft: (body.status ?? current.status) === VendorBillStatus.Draft,
      currency: current.document.currency,
      issueDate: body.issueDate ? new Date(body.issueDate) : current.document.issueDate,
      requestedRate: body.exchangeRate,
    });

    const { updated, wasDraft } = await this.repos.tx(async (tx) => {
      const existing = await tx.vendorBills.findById(id, ctx.organizationId);
      if (!existing) throw VendorBillNotFoundException();
      const wasDraft = existing.status === VendorBillStatus.Draft;

      let updated: VendorBill = existing;
      if (body.status !== undefined) {
        const patched = await tx.vendorBills.update(id, ctx.organizationId, { status: body.status });
        updated = { ...existing, ...patched };
      }

      const documentUpdate: DocumentUpdate = {};
      if (body.externalDocumentNumber !== undefined) documentUpdate.externalDocumentNumber = body.externalDocumentNumber;
      if (body.issueDate !== undefined) documentUpdate.issueDate = new Date(body.issueDate);
      if (body.dueDate !== undefined) documentUpdate.dueDate = body.dueDate ? new Date(body.dueDate) : null;
      if (body.notes !== undefined) documentUpdate.notes = body.notes;

      if (body.lineItems !== undefined || !plan.frozen) {
        const built = await buildDocumentLines({
          repos: tx,
          organizationId: ctx.organizationId,
          currency: existing.document.currency,
          side: DocumentSide.Purchase,
          lineItems: body.lineItems ?? lineInputsOf(existing.document),
          policy: plan.policy,
          exchangeRate: plan.exchange?.rate ?? null,
        });
        Object.assign(documentUpdate, built.totals, documentMoneyFields(plan, built.base));
        await tx.documents.replaceLineItems(existing.documentId, ctx.organizationId, built.lineItems);
      }

      if (Object.keys(documentUpdate).length > 0) {
        await tx.documents.update(existing.documentId, ctx.organizationId, documentUpdate);
      }
      return { updated, wasDraft };
    });

    if (wasDraft && updated.status !== VendorBillStatus.Draft) await this.emitRecorded(ctx.organizationId, updated.id);
    return updated;
  }
```

Add the imports:
- the `DocumentUpdate` type
- `planDocumentWrite` and `documentMoneyFields`
- `lineInputsOf`

- [ ] **Step 5: Run and confirm it passes**

Run: `bunx vitest run tests/unit && bun run typecheck`
Expected: PASS.

---

### Task 8: Notes inherit the referenced rate and policy; currency must match

**Files:**
- Modify: `src/domains/notes/{service,validation,mappers}.ts`
- Test: `tests/unit/note-exchange.test.ts`

**Interfaces:**
- Consumes: `planDocumentWrite(referenced)`, `exchangeOf`, `DocumentCurrencyMismatchException`, and the response helpers.

- [ ] **Step 1: Write the failing test** — `tests/unit/note-exchange.test.ts`

```ts
import { describe, expect, test } from "vitest";
import { inMemoryAdapter } from "../../src/adapters/memory";
import { buildServices } from "../../src/services";
import { buildMoneySettings } from "../../src/lib/money/settings";
import { RECOMMENDED_MONEY_POLICY } from "../../src/lib/money";
import { ExchangeRateSource, InvoiceStatus, NoteStatus, NoteType } from "../../src/types";
import type { AuthContext } from "../../src/auth/types";

const ctx: AuthContext = { userId: "u", organizationId: "org", role: null };
let rate = "59.347";

async function setup() {
  const repos = inMemoryAdapter();
  const services = buildServices(
    repos,
    undefined,
    buildMoneySettings({
      moneyPolicy: () => RECOMMENDED_MONEY_POLICY,
      exchangeRates: { baseCurrency: () => "dop", resolve: async () => rate },
    }),
  );
  const client = await repos.clients.create({ organizationId: "org", name: "Hotel" });
  const tour = { source: { type: "experience", id: "tour", name: "Tour" }, quantity: "1", price: "100000", taxIds: [] };
  const invoice = await services.invoices.create(
    { clientId: client.id, issueDate: "2026-09-01", currency: "usd", status: InvoiceStatus.Sent, paymentMethodIds: [], lineItems: [tour] } as any,
    ctx,
  );
  const invoiceDoc = (await services.invoices.findById(invoice.id, ctx)).document;
  const note = (overrides: Record<string, unknown> = {}) =>
    ({
      noteType: NoteType.Credit,
      referencedDocumentId: invoiceDoc.id,
      clientId: client.id,
      issueDate: "2026-09-25",
      status: NoteStatus.Issued,
      lineItems: [{ ...tour, price: "20000" }],
      ...overrides,
    }) as any;
  return { services, note };
}

describe("notes and exchange rates", () => {
  test("an issued note inherits the invoice's rate, not the note date's", async () => {
    rate = "59.347";
    const { services, note } = await setup();
    rate = "61";
    const created = await services.notes.create(note(), ctx);
    const doc = (await services.notes.findById(created.id, ctx)).document;
    expect(doc.currency).toBe("usd");
    expect(doc.exchangeRate).toBe("59.347");
    expect(doc.exchangeRateSource).toBe(ExchangeRateSource.Referenced);
    expect(doc.moneyPolicy).toEqual(RECOMMENDED_MONEY_POLICY);
    expect(doc.baseSubtotal).toBe(1_186_940n);
  });

  test("an explicit different currency is rejected and nothing is written", async () => {
    const { services, note } = await setup();
    await expect(services.notes.create(note({ currency: "eur" }), ctx)).rejects.toThrow(/CURRENCY_MISMATCH/);
    expect((await services.notes.list({} as any, ctx)).data).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Run and confirm it fails**

Run: `bunx vitest run tests/unit/note-exchange.test.ts`
Expected: FAIL. The note gets currency `usd` from `DEFAULT_CURRENCY` but no rate, and `eur` is accepted.

- [ ] **Step 3: Validation and mappers.**
  - Add `exchangeRate: exchangeRateSchema.optional().nullable(),` to `createNoteBody`'s object (inside `.object({…})`, before `.refine`) and to `updateNoteBody`.
  - In `lineItemResponse`, spread `...lineItemBaseResponseFields`, and spread `...lineItemTaxBaseResponseFields` into its taxes.
  - In the note response's `document`, spread `...documentMoneyResponseFields`.
  - Mappers: `lineItemToResponse` gets the line and tax base helpers; `documentToResponse` gets `...documentMoneyToResponse(doc)`.

- [ ] **Step 4: Service.** Replace `create` and `update` in `src/domains/notes/service.ts`:

```ts
  async create(body: CreateNoteBody, ctx: AuthContext): Promise<Note> {
    const ref = await this.repos.documents.findById(body.referencedDocumentId, ctx.organizationId);
    if (!ref) throw NoteReferencedDocumentNotFoundException();
    if (ref.type === DocumentType.CreditNote || ref.type === DocumentType.DebitNote) throw NoteReferencesNoteException();
    const isSales = body.clientId != null;
    if (isSales && ref.type !== DocumentType.Invoice)
      throw DocumentPartyInvalidException("A client note must reference an INVOICE");
    if (!isSales && ref.type !== DocumentType.VendorBill)
      throw DocumentPartyInvalidException("A vendor note must reference a VENDOR_BILL");

    const referencedCurrency = normalizeCurrency(ref.currency);
    const currency = normalizeCurrency(body.currency ?? referencedCurrency);
    if (currency !== referencedCurrency) throw DocumentCurrencyMismatchException(currency, referencedCurrency);

    const issueDate = new Date(body.issueDate);
    const plan = await planDocumentWrite({
      money: this.money,
      organizationId: ctx.organizationId,
      existing: null,
      existingIsDraft: true,
      willBeDraft: body.status === NoteStatus.Draft,
      currency,
      issueDate,
      requestedRate: body.exchangeRate,
      referenced: { exchange: exchangeOf(ref), policy: ref.moneyPolicy },
    });

    const docType = body.noteType === NoteType.Credit ? DocumentType.CreditNote : DocumentType.DebitNote;
    const note = await this.repos.tx(async (tx) => {
      const number = await this.numbering.next(tx, ctx.organizationId, docType, null);
      const built = await buildDocumentLines({
        repos: tx,
        organizationId: ctx.organizationId,
        currency,
        side: documentSide(docType),
        lineItems: body.lineItems,
        policy: plan.policy,
        exchangeRate: plan.exchange?.rate ?? null,
      });
      const doc = await tx.documents.create({
        type: docType,
        organizationId: ctx.organizationId,
        clientId: body.clientId ?? null,
        vendorId: body.vendorId ?? null,
        referencedDocumentId: body.referencedDocumentId,
        externalDocumentNumber: body.externalDocumentNumber ?? null,
        documentNumberPrefix: null,
        documentNumber: number,
        issueDate,
        dueDate: body.dueDate ? new Date(body.dueDate) : null,
        notes: body.notes ?? null,
        currency,
        ...built.totals,
        lineItems: built.lineItems,
        ...documentMoneyFields(plan, built.base),
      });
      return tx.notes.create({ documentId: doc.id, status: body.status });
    });

    if (note.status !== NoteStatus.Draft) await this.emitRecorded(ctx.organizationId, note.id);
    return note;
  }

  async update(id: string, body: UpdateNoteBody, ctx: AuthContext): Promise<Note> {
    const current = await this.repos.notes.findById(id, ctx.organizationId);
    if (!current) throw NoteNotFoundException();
    const ref = current.document.referencedDocumentId
      ? await this.repos.documents.findById(current.document.referencedDocumentId, ctx.organizationId)
      : null;
    const plan = await planDocumentWrite({
      money: this.money,
      organizationId: ctx.organizationId,
      existing: current.document,
      existingIsDraft: current.status === NoteStatus.Draft,
      willBeDraft: (body.status ?? current.status) === NoteStatus.Draft,
      currency: current.document.currency,
      issueDate: body.issueDate ? new Date(body.issueDate) : current.document.issueDate,
      requestedRate: body.exchangeRate,
      referenced: ref ? { exchange: exchangeOf(ref), policy: ref.moneyPolicy } : undefined,
    });

    const { updated, wasDraft } = await this.repos.tx(async (tx) => {
      const existing = await tx.notes.findById(id, ctx.organizationId);
      if (!existing) throw NoteNotFoundException();
      const wasDraft = existing.status === NoteStatus.Draft;

      let updated: Note = { id: existing.id, documentId: existing.documentId, status: existing.status };
      if (body.status !== undefined) {
        const patched = await tx.notes.update(id, ctx.organizationId, { status: body.status });
        updated = { ...updated, ...patched };
      }

      const documentUpdate: DocumentUpdate = {};
      if (body.externalDocumentNumber !== undefined) documentUpdate.externalDocumentNumber = body.externalDocumentNumber;
      if (body.issueDate !== undefined) documentUpdate.issueDate = new Date(body.issueDate);
      if (body.dueDate !== undefined) documentUpdate.dueDate = body.dueDate ? new Date(body.dueDate) : null;
      if (body.notes !== undefined) documentUpdate.notes = body.notes;

      if (body.lineItems !== undefined || !plan.frozen) {
        const built = await buildDocumentLines({
          repos: tx,
          organizationId: ctx.organizationId,
          currency: existing.document.currency,
          side: documentSide(existing.document.type),
          lineItems: body.lineItems ?? lineInputsOf(existing.document),
          policy: plan.policy,
          exchangeRate: plan.exchange?.rate ?? null,
        });
        Object.assign(documentUpdate, built.totals, documentMoneyFields(plan, built.base));
        await tx.documents.replaceLineItems(existing.documentId, ctx.organizationId, built.lineItems);
      }

      if (Object.keys(documentUpdate).length > 0) {
        await tx.documents.update(existing.documentId, ctx.organizationId, documentUpdate);
      }
      return { updated, wasDraft };
    });

    if (wasDraft && updated.status !== NoteStatus.Draft) await this.emitRecorded(ctx.organizationId, updated.id);
    return updated;
  }
```

Imports:
- `exchangeOf` and `DocumentCurrencyMismatchException` from `../../lib/exchange`
- `planDocumentWrite` and `documentMoneyFields` from `../../lib/document-issuance`
- `lineInputsOf`
- the `DocumentUpdate` type

Remove the `DEFAULT_CURRENCY` import if it's now unused.

- [ ] **Step 5: Run and confirm it passes**

Run: `bunx vitest run tests/unit && bun run typecheck && bunx vitest run tests/integration/notes.test.ts`
Expected: PASS. If an existing notes integration test relied on a note defaulting to `usd` while its invoice was `dop`, it now correctly gets the invoice's currency. Update that expectation, and note it in the release notes (Task 10).

---

### Task 9: Quotes carry an agreed rate

**Files:**
- Modify: `src/domains/quotes/{service,validation,mappers}.ts`
- Test: `tests/unit/quote-exchange.test.ts`

- [ ] **Step 1: Write the failing test** — `tests/unit/quote-exchange.test.ts`

```ts
import { describe, expect, test } from "vitest";
import { inMemoryAdapter } from "../../src/adapters/memory";
import { buildServices } from "../../src/services";
import { buildMoneySettings } from "../../src/lib/money/settings";
import { RECOMMENDED_MONEY_POLICY } from "../../src/lib/money";
import { ExchangeRateSource, QuoteStatus } from "../../src/types";
import type { AuthContext } from "../../src/auth/types";

const ctx: AuthContext = { userId: "u", organizationId: "org", role: null };

describe("quotes carry an agreed rate into the invoice draft", () => {
  test("manual quote rate → invoice draft manual rate; quote never freezes", async () => {
    const repos = inMemoryAdapter();
    const services = buildServices(
      repos,
      undefined,
      buildMoneySettings({
        moneyPolicy: () => RECOMMENDED_MONEY_POLICY,
        exchangeRates: { baseCurrency: () => "dop", resolve: async () => "59" },
      }),
    );
    const client = await repos.clients.create({ organizationId: "org", name: "Agency" });
    const quote = await services.quotes.create(
      {
        clientId: client.id,
        issueDate: "2026-09-25",
        currency: "usd",
        status: QuoteStatus.Sent,
        exchangeRate: "60",
        paymentMethodIds: [],
        lineItems: [{ source: { type: "experience", id: "tour", name: "Tour" }, quantity: "1", price: "5000", taxIds: [] }],
      } as any,
      ctx,
    );
    const quoteDoc = (await services.quotes.findById(quote.id, ctx)).document;
    expect(quoteDoc.exchangeRate).toBe("60");
    expect(quoteDoc.moneyPolicy).toBeNull();

    const invoice = await services.invoices.convertFromQuote(quote.id, {}, ctx);
    const invoiceDoc = (await services.invoices.findById(invoice.id, ctx)).document;
    expect(invoiceDoc.exchangeRate).toBe("60");
    expect(invoiceDoc.exchangeRateSource).toBe(ExchangeRateSource.Manual);
  });
});
```

- [ ] **Step 2: Run and confirm it fails**

Run: `bunx vitest run tests/unit/quote-exchange.test.ts`
Expected: FAIL. `exchangeRate` is null on the quote.

- [ ] **Step 3: Validation and mappers.**
  - Add `exchangeRate: exchangeRateSchema.optional().nullable(),` to `createQuoteBody` and `updateQuoteBody`.
  - Spread the three response field sets into the quote response, exactly as in Task 6 Step 5.

- [ ] **Step 4: Service.** Quotes are never issued, so every write plans as a draft. That means the current policy applies, and a manual rate is stored but not converted with.
  - In `create`: before the transaction, compute
    - `currency = normalizeCurrency(body.currency ?? DEFAULT_CURRENCY)`
    - `plan = await planDocumentWrite({ money: this.money, organizationId: ctx.organizationId, existing: null, existingIsDraft: true, willBeDraft: true, currency, issueDate: new Date(body.issueDate), requestedRate: body.exchangeRate })`

    Inside the transaction, call `buildDocumentLines` with `policy: plan.policy`, `exchangeRate: null`, and spread `...documentMoneyFields(plan, null)` into `tx.documents.create`.
  - In `update`: before the transaction, load `current = await this.repos.quotes.findById(id, ctx.organizationId)` (404 if missing), then:

    ```ts
    plan = await planDocumentWrite({
      money: this.money,
      organizationId: ctx.organizationId,
      existing: current.document,
      existingIsDraft: true,
      willBeDraft: true,
      currency: current.document.currency,
      issueDate: body.issueDate ? new Date(body.issueDate) : current.document.issueDate,
      requestedRate: body.exchangeRate,
    })
    ```

    Inside the transaction, always recompute: `lineItems: body.lineItems ?? lineInputsOf(existing.document)` under `plan.policy`, then `Object.assign(documentUpdate, built.totals, documentMoneyFields(plan, null))` and `replaceLineItems`.

- [ ] **Step 5: Run and confirm it passes**

Run: `bunx vitest run tests/unit && bun run typecheck`
Expected: PASS.

---

### Task 10: `POST /documents/calculate`, public exports, release

**Files:**
- Create: `src/domains/documents/validation.ts`, `src/domains/documents/service.ts`, `src/domains/documents/routes.ts`
- Modify: `src/services.ts`, `src/router.ts`, `src/index.ts`
- Modify: `package.json` and `../cli/package.json` (version `0.17.0`), `README.md` (Money policy & exchange rates section)
- Modify: `tests/integration/harness.ts` (accept `moneyPolicy` / `exchangeRates`)
- Create: `tests/unit/documents-calculate.test.ts`, `tests/integration/exchange-rate.test.ts`

**Interfaces:**
- Produces:
  - `DocumentCalculationService.calculate(body: CalculateDocumentBody, ctx: AuthContext): Promise<CalculateDocumentResponse>`
  - The route `POST {basePath}/documents/calculate`
  - Package exports: `calculateDocument`, `allocate`, `roundDiv`, `parseScaled`, `canonicalDecimal`, `LEGACY_MONEY_POLICY`, `RECOMMENDED_MONEY_POLICY`, `RoundingMode`, `TaxLevel`, `BaseTaxMethod`, `ExchangeRateSource`, and the types `MoneyPolicy`, `ExchangeRateProvider`, `DocumentCalculation`, `TaxDefinition`, `AmountTotals`

- [ ] **Step 1: Write the failing tests.**

`tests/unit/documents-calculate.test.ts`:

```ts
import { describe, expect, test } from "vitest";
import { Hono } from "hono";
import { createInvoicingKit, RECOMMENDED_MONEY_POLICY } from "../../src";
import { inMemoryAdapter } from "../../src/adapters/memory";

function app(rate: string | null) {
  const adapter = inMemoryAdapter();
  const kit = createInvoicingKit({
    adapter,
    auth: { api: { getSession: async () => ({ user: { id: "u" }, session: { activeOrganizationId: "org" } }) } },
    basePath: "/api/bills",
    moneyPolicy: () => RECOMMENDED_MONEY_POLICY,
    exchangeRates: { baseCurrency: () => "dop", resolve: async () => rate },
  });
  const hono = new Hono();
  hono.route("/", kit.router);
  return { hono, adapter };
}

describe("POST /documents/calculate", () => {
  test("previews totals and base amounts with the provider rate", async () => {
    const { hono, adapter } = app("59.347");
    const tax = await adapter.taxes.create({ organizationId: "org", name: "ITBIS", type: "PERCENTAGE", rate: "0.18" });
    const res = await hono.request("/api/bills/documents/calculate", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ currency: "USD", issueDate: "2026-09-25", lineItems: [{ quantity: "1", price: "100000", taxIds: [tax.id] }] }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.total).toBe("118000");
    expect(body.exchange).toEqual({ baseCurrency: "dop", rate: "59.347", rateDate: "2026-09-25", source: "provider" });
    expect(body.base).toEqual({ subtotal: "5934700", tax: "1068246", total: "7002946" });
  });

  test("no rate for the date → base is null, never an error", async () => {
    const { hono } = app(null);
    const res = await hono.request("/api/bills/documents/calculate", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ currency: "usd", issueDate: "2026-09-25", lineItems: [{ quantity: "1.5", price: "333", taxIds: [] }] }),
    });
    const body = await res.json();
    expect(body.subtotal).toBe("500");
    expect(body.exchange).toBeNull();
    expect(body.base).toBeNull();
  });
});
```

`tests/integration/exchange-rate.test.ts` covers the Prisma round trip through HTTP. Extend `buildHarness` first (Step 4).

```ts
import { describe, expect, test } from "vitest";
import { createInvoicingKit, RECOMMENDED_MONEY_POLICY } from "../../src";
import { buildHarness } from "./harness";

describe("exchange rate over HTTP (prisma)", () => {
  test("issuing a USD invoice freezes rate and base amounts; draft saves without a rate", async () => {
    let rate: string | null = "59.347";
    const h = await buildHarness(createInvoicingKit, {
      moneyPolicy: () => RECOMMENDED_MONEY_POLICY,
      exchangeRates: { baseCurrency: () => "dop", resolve: async () => rate },
    });
    const client = await h.repos.clients.create({ organizationId: h.organizationId, name: "Hotel" });
    const tax = await h.repos.taxes.create({ organizationId: h.organizationId, name: "ITBIS", type: "PERCENTAGE", rate: "0.18" });
    const post = (body: unknown) =>
      h.app.request("/api/bills/invoices", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    const invoiceBody = (status: string) => ({
      clientId: client.id,
      issueDate: "2026-09-25",
      currency: "usd",
      status,
      lineItems: [{ source: { type: "experience", id: "tour", name: "Tour" }, quantity: "1", price: "100000", taxIds: [tax.id] }],
    });

    const sent = await (await post(invoiceBody("sent"))).json();
    expect(sent.document.exchangeRate).toBe("59.347");
    expect(sent.document.baseTotal).toBe("7002946");
    expect(sent.document.lineItems[0].baseSubtotal).toBe("5934700");
    expect(sent.document.lineItems[0].taxes[0].baseTaxAmount).toBe("1068246");

    rate = null;
    const draftRes = await post(invoiceBody("draft"));
    expect(draftRes.status).toBe(201);
    const draft = await draftRes.json();
    const issue = await h.app.request(`/api/bills/invoices/${draft.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ status: "sent" }),
    });
    expect(issue.status).toBe(422);
  });
});
```

Adjust `h.repos` / `h.app` to the names `buildHarness` actually returns. It returns `app` and `organizationId`, and the kit's `repos` via `kit.repos`; expose them if they aren't already.

- [ ] **Step 2: Run and confirm it fails**

Run: `bunx vitest run tests/unit/documents-calculate.test.ts`
Expected: FAIL (404, no route; `RECOMMENDED_MONEY_POLICY` isn't exported from `src`).

- [ ] **Step 3: Implement the endpoint.**

`src/domains/documents/validation.ts`:

```ts
import { z } from "zod";
import { currencyCodeSchema } from "../../lib/currency";
import { exchangeRateSchema } from "../../lib/exchange";
import { ExchangeRateSource } from "../../types";

export const calculateDocumentBody = z.object({
  currency: currencyCodeSchema.optional(),
  issueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  exchangeRate: exchangeRateSchema.optional().nullable(),
  lineItems: z
    .array(
      z.object({
        quantity: z.string().regex(/^\d+(\.\d{1,4})?$/, "Invalid quantity"),
        price: z.string().regex(/^\d+$/, "Price must be integer minor units"),
        taxIds: z.array(z.string()).default([]),
      }),
    )
    .min(1)
    .max(500),
});
export type CalculateDocumentBody = z.infer<typeof calculateDocumentBody>;

const totals = z.object({ subtotal: z.string(), tax: z.string(), total: z.string() });

export const calculateDocumentResponse = z.object({
  currency: z.string(),
  subtotal: z.string(),
  tax: z.string(),
  total: z.string(),
  lines: z.array(
    z.object({ subtotal: z.string(), taxAmount: z.string(), total: z.string(), baseSubtotal: z.string().nullable() }),
  ),
  taxTotals: z.array(z.object({ taxId: z.string(), amount: z.string(), baseAmount: z.string().nullable() })),
  exchange: z
    .object({
      baseCurrency: z.string(),
      rate: z.string(),
      rateDate: z.string().nullable(),
      source: z.nativeEnum(ExchangeRateSource),
    })
    .nullable(),
  base: totals.nullable(),
});
export type CalculateDocumentResponse = z.infer<typeof calculateDocumentResponse>;
```

`src/domains/documents/service.ts`:

```ts
import type { Repositories } from "../../adapters/types";
import type { AuthContext } from "../../auth/types";
import { ExchangeRateSource } from "../../types";
import { DEFAULT_CURRENCY, normalizeCurrency } from "../../lib/currency";
import { calculateDocument, canonicalDecimal, type TaxDefinition } from "../../lib/money";
import type { MoneySettings } from "../../lib/money/settings";
import type { CalculateDocumentBody, CalculateDocumentResponse } from "./validation";

type PreviewExchange = { baseCurrency: string; rate: string; rateDate: string | null; source: ExchangeRateSource };

/** Stateless preview of a document's amounts under the organization's policy. Never writes; a missing rate means no base amounts. */
export class DocumentCalculationService {
  constructor(private readonly repos: Repositories, private readonly money: MoneySettings) {}

  private async previewExchange(body: CalculateDocumentBody, organizationId: string, currency: string): Promise<PreviewExchange | null> {
    const provider = this.money.exchangeRates;
    if (!provider) return null;
    const baseCurrency = normalizeCurrency(await provider.baseCurrency({ organizationId }));
    if (baseCurrency === currency) return { baseCurrency, rate: "1", rateDate: body.issueDate ?? null, source: ExchangeRateSource.Identity };
    if (body.exchangeRate) return { baseCurrency, rate: body.exchangeRate, rateDate: body.issueDate ?? null, source: ExchangeRateSource.Manual };
    if (!body.issueDate) return null;
    const resolved = await provider.resolve({ organizationId, from: currency, to: baseCurrency, date: new Date(body.issueDate) });
    return resolved === null
      ? null
      : { baseCurrency, rate: canonicalDecimal(resolved), rateDate: body.issueDate, source: ExchangeRateSource.Provider };
  }

  async calculate(body: CalculateDocumentBody, ctx: AuthContext): Promise<CalculateDocumentResponse> {
    const currency = normalizeCurrency(body.currency ?? DEFAULT_CURRENCY);
    const policy = await this.money.policyFor(ctx.organizationId);
    const exchange = await this.previewExchange(body, ctx.organizationId, currency);
    const taxIds = [...new Set(body.lineItems.flatMap((line) => line.taxIds))];
    const taxes = taxIds.length > 0 ? await this.repos.taxes.findManyById(taxIds, ctx.organizationId) : [];
    const taxById = new Map(taxes.map((tax) => [tax.id, tax]));
    const result = calculateDocument({
      policy,
      exchangeRate: exchange?.rate ?? null,
      lines: body.lineItems.map((line) => ({
        quantity: line.quantity,
        price: BigInt(line.price),
        taxes: [...new Set(line.taxIds)].flatMap((id): TaxDefinition[] => {
          const tax = taxById.get(id);
          return tax ? [{ id: tax.id, type: tax.type, rate: tax.rate }] : [];
        }),
      })),
    });
    const minor = (value: bigint | null) => (value === null ? null : value.toString());
    return {
      currency,
      subtotal: result.subtotal.toString(),
      tax: result.tax.toString(),
      total: result.total.toString(),
      lines: result.lines.map((line) => ({
        subtotal: line.subtotal.toString(),
        taxAmount: line.taxAmount.toString(),
        total: line.total.toString(),
        baseSubtotal: minor(line.baseSubtotal),
      })),
      taxTotals: result.taxTotals.map((total) => ({ taxId: total.taxId, amount: total.amount.toString(), baseAmount: minor(total.baseAmount) })),
      exchange,
      base: result.base
        ? { subtotal: result.base.subtotal.toString(), tax: result.base.tax.toString(), total: result.base.total.toString() }
        : null,
    };
  }
}
```

`src/domains/documents/routes.ts`:

```ts
import { createRoute, OpenAPIHono } from "@hono/zod-openapi";
import { authMiddleware, type BetterAuthLike } from "../../auth/middleware";
import type { AuthVariables } from "../../auth/types";
import type { DocumentCalculationService } from "./service";
import { calculateDocumentBody, calculateDocumentResponse } from "./validation";

export function buildDocumentsRouter(service: DocumentCalculationService, auth: BetterAuthLike) {
  const app = new OpenAPIHono<{ Variables: AuthVariables }>();
  app.use("*", authMiddleware(auth));
  app.openapi(
    createRoute({
      method: "post",
      path: "/documents/calculate",
      tags: ["Documents"],
      request: { body: { content: { "application/json": { schema: calculateDocumentBody } } } },
      responses: {
        200: { content: { "application/json": { schema: calculateDocumentResponse } }, description: "Calculated" },
        401: { description: "Unauthorized" },
      },
    }),
    async (c) => c.json(await service.calculate(c.req.valid("json"), c.var.authContext)),
  );
  return app;
}
```

Wire it up:
- `Services` gains `documents: DocumentCalculationService`, and `buildServices` creates it with `new DocumentCalculationService(repos, settings)`.
- `router.ts` adds `root.route(basePath, buildDocumentsRouter(services.documents, auth));`.

- [ ] **Step 4: Harness.** In `tests/integration/harness.ts`:
  - Add `moneyPolicy?` and `exchangeRates?` to `HarnessOptions` (typed from `InvoicingKitConfig`).
  - Widen the `createInvoicingKit` parameter type to `(config: InvoicingKitConfig) => …`.
  - Pass `moneyPolicy: opts.moneyPolicy, exchangeRates: opts.exchangeRates` into the `createInvoicingKit({...})` call.
  - Return `repos: kit.repos` from the harness if it isn't returned already.

- [ ] **Step 5: Public exports** (`src/index.ts`):

```ts
export type { ExchangeRateProvider } from "./config";
export {
  RoundingMode,
  TaxLevel,
  BaseTaxMethod,
  ExchangeRateSource,
} from "./types";
export type { MoneyPolicy } from "./types";
export {
  calculateDocument,
  allocate,
  roundDiv,
  parseScaled,
  canonicalDecimal,
  LEGACY_MONEY_POLICY,
  RECOMMENDED_MONEY_POLICY,
} from "./lib/money";
export type {
  AmountTotals,
  CalculateDocumentInput,
  DocumentCalculation,
  LineCalculation,
  TaxDefinition,
  TaxTotal,
} from "./lib/money";
```

- [ ] **Step 6: Version and docs.**
  - Bump `packages/invoicing-kit/package.json` and `packages/cli/package.json` to `0.17.0`.
  - Add a README section, **"Money policy & exchange rates"**, covering:
    1. `moneyPolicy` (default legacy; `RECOMMENDED_MONEY_POLICY` for new tenants; `truncate` documented as lossy)
    2. `exchangeRates` provider contract (`null` → 422 `EXCHANGE_RATE_REQUIRED`; a thrown error propagates)
    3. The freeze rules table from the spec §6
    4. `POST /documents/calculate`
    5. The upgrade steps: add the columns listed in spec §4 and migrate **before** installing 0.17.0
    6. Behavior changes:
       - Notes default to their referenced document's currency, and reject a mismatch.
       - Converting a quote recomputes lines under the current policy.
       - A fractional FIXED tax rate is now honored (it used to be truncated to its integer part).
  - Create `RELEASE_NOTES_0.17.0.md` next to `RELEASING.md` with the same upgrade steps. It's the GitHub Release body.

- [ ] **Step 7: Run everything and confirm it passes**

Run:

```bash
bun run typecheck
bunx vitest run tests/unit
INVOICING_KIT_TEST_DATABASE_URL="postgresql://test:test@localhost:5544/invoicing_kit_test" bun run db:push
bunx vitest run tests/conformance tests/integration
bun run build
```

Expected:
- Typecheck clean; all unit tests pass.
- DB suites: every test passes except the 11 baseline failures.
- The build succeeds.

Finish with `git status` to list the changed files. **Do not commit.**

---

## Self-Review

**Spec coverage, spec § → task:**

| Spec section | Task |
|---|---|
| §1 money policy config | 1, 4 |
| §2 calculator and invariants | 2 |
| §3 provider | 4 |
| §4 data model | 3 |
| §5 base amounts (recompute/convert, conversion half-up) | 2 |
| §6 freeze rules: drafts, issue, notes, quotes, after issue | 6–9 |
| §7 API: body `exchangeRate` and its 422s | 6–9 |
| §7 responses | 6–9 |
| §7 calculate route | 10 |
| §7 repositories | 3 |
| §8 schema and release | 3, 10 |
| Testing | 1–10 |
| Rollout item 1 | 10 |

**Placeholders:** none. Task 9 Step 4 describes the quote changes in prose, with the exact calls spelled out.

**Type consistency:**
- `planDocumentWrite` args and `DocumentWritePlan` fields are used identically in Tasks 6–9.
- `buildDocumentLines({ repos, organizationId, currency, side, lineItems, policy, exchangeRate })` is used identically everywhere.
- `documentMoneyFields(plan, base)` is used identically everywhere.

**Review Focus:** each item is pinned (Task 1/2 zero weights, Task 6 provider decimals and re-issue, Task 3 line order, Task 8 currency mismatch).
