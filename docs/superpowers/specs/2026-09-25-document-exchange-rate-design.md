# Money policy and document exchange rate — design

**Date:** 2026-09-25
**Status:** Draft
**Packages:** `invoicing-kit` and `@invoicing-kit/cli` (schema template). Released together as **0.17.0**.
**Supersedes:** the *"Multi-currency conversion — currency passes through as a string, no FX"* non-goal in `2026-05-27-invoicing-kit-design.md`.

## Goal

1. **No cent is ever lost or invented.**
   - Every rounded amount follows one declared rounding rule.
   - Every split (per-line tax, base-currency line amounts) is an **exact allocation**: the parts sum to the whole.
   - Today the kit truncates the line subtotal (`qty × price`) and each line's tax. That biases every document **down**, and the lost fractions are gone.
2. **Tax is calculated the way the tenant's tax authority calculates it.**
   - Per line, or once per tax rate on the document total.
   - Half-up, half-even, or (legacy) truncation.
3. **A document issued in a currency other than the tenant's base currency records the exchange rate it was issued at.** It also records its amounts in the base currency, computed once and then frozen. Every consumer (ledger, tax filings, reports) reads the same rate and the same base amounts instead of converting on its own.

The first consumer is domingo-api (Dominican Republic: DGII e-CF, 607, a
ledger). Its companion spec is domingo-api
`docs/superpowers/specs/2026-09-25-foreign-currency-fiscal-amounts-design.md`.

## Non-goals

- Settling a payment in a different currency. A payment's currency still equals its document's currency.
- FX gain/loss, remeasurement, or any ledger concept. Those stay with the consumer.
- Choosing or fetching rates. A consumer-supplied provider answers. The kit never calls the network.
- Country-specific fiscal formats (e-CF, SAF-T, …). Those stay with the consumer.

## Concepts

| Term | Meaning |
|---|---|
| **Money policy** | Per organization: the rounding mode, the tax calculation level, and how base-currency tax is derived. |
| **Rounding mode** | `half_up` (half away from zero), `half_even` (banker's rounding), or `truncate` (legacy). |
| **Tax level** | `line`: each line's tax is rounded, then summed. `document`: each tax's taxable base is summed across lines, taxed once and rounded once, and the result is allocated back to the lines. |
| **Base currency** | The tenant's reporting currency, from the provider. Lowercase via `normalizeCurrency`. |
| **Exchange rate** | Base units per **1** document unit (e.g. `59.3470` DOP per USD). A decimal string, `> 0`, at most 8 decimals. |
| **Exact allocation** | Splitting an integer amount into integer parts in proportion to weights, using largest remainder. Ties are broken by position. The parts always sum to the whole. |

## Design

### 1. Money policy — config

```ts
export const RoundingMode = { HalfUp: "half_up", HalfEven: "half_even", Truncate: "truncate" } as const;
export const TaxLevel = { Line: "line", Document: "document" } as const;
export const BaseTaxMethod = { Recompute: "recompute", Convert: "convert" } as const;

export interface MoneyPolicy {
  rounding: RoundingMode;        // line subtotals and tax (currency conversion is always half-up)
  taxLevel: TaxLevel;
  baseTaxMethod: BaseTaxMethod;  // see §5
}

export interface InvoicingKitConfig {
  // … existing …
  /** Per-organization policy. Absent → LEGACY_MONEY_POLICY (today's behavior). */
  moneyPolicy?: (ctx: { organizationId: string }) => MoneyPolicy | Promise<MoneyPolicy>;
  /** Optional. Absent → documents never carry a rate. */
  exchangeRates?: ExchangeRateProvider;
}

export const LEGACY_MONEY_POLICY: MoneyPolicy = {
  rounding: RoundingMode.Truncate, taxLevel: TaxLevel.Line, baseTaxMethod: BaseTaxMethod.Recompute,
};
export const RECOMMENDED_MONEY_POLICY: MoneyPolicy = {
  rounding: RoundingMode.HalfUp, taxLevel: TaxLevel.Document, baseTaxMethod: BaseTaxMethod.Recompute,
};
```

- The const-enums go in `src/types.ts`, following the repo's no-magic-literals rule.
- The default stays legacy, so upgrading never silently changes anyone's totals.
- The README recommends `RECOMMENDED_MONEY_POLICY` for new tenants.
- `truncate` is kept only for backward compatibility and documented as lossy.

- **Drafts** are computed under the organization's **current** policy on every write, since a draft isn't final.
- **At issue**, the policy is recorded on the document (`moneyPolicy` JSON, §4). An issued document is always recomputed under its recorded policy, even if the tenant's policy later changes.
- Documents issued before 0.17.0 have `moneyPolicy = null` and keep the legacy policy.

### 2. Calculator — `src/lib/money/` (pure, exported)

This replaces the private `DocumentCalculator` / `TaxStrategy` math. There is
one implementation: the kit's services call it, and consumers import it (e.g.
for editor previews) instead of copying it.

```ts
export function calculateDocument(input: {
  lines: Array<{ quantity: DecimalString; price: BigintMinor; taxes: TaxDef[] }>;
  policy: MoneyPolicy;
  exchange?: { rate: DecimalString; baseCurrency: string }; // §5
}): DocumentCalculation;
```

The rules. Everything is BigInt fixed-point; there is no `Number` anywhere.

1. **Line subtotal** = `round(quantity × price)` under `policy.rounding`. The quantity is fixed-point at 4 decimals, as today.
2. **Percentage tax, `line` level:** each line's tax = `round(lineSubtotal × rate)`. Document tax = the sum.
3. **Percentage tax, `document` level:** for each tax, `base = Σ lineSubtotal` over the lines carrying it, then `taxTotal = round(base × rate)`. That total is **allocated** back to those lines in proportion to their subtotals, so `Σ lineTax = taxTotal` exactly. The per-line `DocumentLineItemTax` rows keep existing, and they sum exactly.
4. **Fixed tax** (minor units per unit) = `round(amount × quantity)` per line at both levels. It is a per-unit charge, so there's no base to aggregate. The fixed amount keeps up to 4 decimals; pre-0.17 dropped its fractional part, a defect 0.17.0 fixes under every policy (release notes list it).
5. **Document totals:** `subtotal = Σ lineSubtotal`, `tax = Σ taxTotal`, `total = subtotal + tax`. They hold by construction, with no independent rounding of totals.
6. **Rounding primitive:** `roundScaled(numerator, scale, mode)` works by magnitude with sign preserved, so it's correct for negative amounts on notes. One function, one test matrix.
7. **Allocation primitive:** `allocate(total, weights)`, largest remainder, deterministic. It is used for tax at the `document` level and for base amounts (§5). All line subtotals of one document share a sign; mixed signs are rejected (RangeError).

**Invariants.** Property-tested on random documents with large BigInts, for every policy:
- `Σ line subtotals = subtotal`
- `Σ line taxes = tax`
- `subtotal + tax = total`
- per tax: `Σ allocated = taxTotal`
- Base currency: the same invariants hold with the base amounts.

### 3. Exchange-rate provider — config

```ts
export interface ExchangeRateProvider {
  /** The tenant's base (reporting) currency, any case; the kit normalizes it. */
  baseCurrency(ctx: { organizationId: string }): string | Promise<string>;
  /** Base units per 1 `from` unit effective on `date`, or null when unknown. Never ≤ 0. */
  resolve(ctx: { organizationId: string; from: string; to: string; date: Date }): Promise<string | null>;
}
```

### 4. Data model

**`Document`** (all new fields nullable, so existing rows are untouched):

| Field | Type | Notes |
|---|---|---|
| `moneyPolicy` | `Json` | The policy the document was computed under (§1). `null` means legacy. |
| `baseCurrency` | `VarChar(3)` | Set together with the rate. |
| `exchangeRate` | `Decimal(18, 8)` | `1` when the currencies match. |
| `exchangeRateDate` | `Date` | The date the rate applies to (the `issueDate` at freeze time). |
| `exchangeRateSource` | `VarChar(16)` | `ExchangeRateSource`: `identity` \| `provider` \| `manual` \| `referenced`. |
| `baseSubtotal` / `baseTax` / `baseTotal` | `BigInt` | Base-currency minor units. |

**`DocumentLineItem`:** `baseSubtotal BigInt?`.
**`DocumentLineItemTax`:** `baseTaxAmount BigInt?`.

### 5. Base-currency amounts

Computed by `calculateDocument` when `exchange` is given, all under the
document's policy:

1. **Line base subtotals:** `allocate(roundHalfUp(subtotal × rate), weights = lineSubtotals)`. Their sum is exactly the converted document subtotal. Lines aren't rounded independently. **Currency conversion always rounds half-up, whatever the policy's rounding mode.** Truncation exists only to reproduce legacy tax math; conversion has no legacy to preserve, and consumers' ledgers already convert half-up.
2. **Base tax**, one of two methods:
   - **`recompute`** (default, and what DGII requires): re-run §2's tax rules **in the base currency** on the line base subtotals. At the `document` level, `baseTaxTotal = round(Σ base × rate)` per tax, allocated to lines. Fixed taxes: `round(fixedLineTax × exchangeRate)`, allocated so the per-tax sum equals `round(Σ fixed × rate)`.
   - **`convert`:** `baseTaxTotal = round(taxTotal × exchangeRate)` per tax, allocated to lines. This is for jurisdictions that convert the tax amount itself.
3. **Totals:** `baseSubtotal = Σ line base`, `baseTax = Σ per-tax base totals`, `baseTotal = baseSubtotal + baseTax`. They hold by construction.
4. **Same currency:** rate `1` (`identity`), and every base amount equals its document amount.

Why `recompute` is the default: tax authorities that require local-currency
invoicing define the tax as *local base × rate* ("calcular primero en DOP",
DGII). Converting a tax that was already rounded in another currency can land
a cent off that definition. Both methods are exact allocations; neither loses
a cent.

### 6. When the rate is set and frozen

| Document | Rule |
|---|---|
| **Draft** invoice / bill | Always saves, with or without a rate. It may carry a `manual` rate (the partner's own). With no manual rate, nothing is resolved until issue. |
| **Issue** (created non-draft, or draft → non-draft) | Precedence: the document's `manual` rate, then `identity`, then `provider.resolve(date = issueDate)`. With no rate → **422 `EXCHANGE_RATE_REQUIRED`** and the document stays a draft. The rate and base amounts are written in the same transaction as the status change. |
| Credit / debit note with `referencedDocumentId` | Inherits the referenced document's `exchangeRate`, `baseCurrency`, `exchangeRateDate` and policy (source `referenced`). Currency must match → 422 `CURRENCY_MISMATCH`. |
| Quote | May carry a `manual` rate: the partner's own agreed rate. It's never frozen. Converting a quote to an invoice carries that manual rate onto the invoice draft, where the partner can clear it (`exchangeRate: null`) before issue; the invoice freezes its rate at its own issue, by the Issue row's precedence. |
| After issue | The rate fields are **immutable**. Updating an issued document's lines recomputes the document and base amounts under the **frozen** rate and the document's recorded policy. |

**Ordering:** the provider and the policy are resolved **before** the write
transaction opens.

- A `null` answer (no rate known for that date) → 422 `EXCHANGE_RATE_REQUIRED`, and the document stays a draft.
- A **thrown** provider error (e.g. the rate store is down) propagates unchanged, so an outage isn't disguised as a missing rate. The issue still fails, and nothing is written.

Neither is ever swallowed, unlike post-commit hooks.

### 7. API surface

- **Create/update bodies:** `exchangeRate?: string` (a `^\d{1,10}(\.\d{1,8})?$` decimal, `> 0`), and `exchangeRate: null` to clear a draft's manual rate.
  - Sending it for a same-currency document → 422 `EXCHANGE_RATE_NOT_APPLICABLE`.
  - Sending it for an issued document → 422 `EXCHANGE_RATE_FROZEN`.
- **Responses** include every §4 field, with money as integer strings.
- **New endpoint:** `POST {basePath}/documents/calculate`, a stateless preview returning `calculateDocument` output for a body of lines + currency (+ optional rate). It uses the organization's policy, so consumers don't need their own totals endpoint.
- **Repositories:** `NewDocument` / `DocumentUpdate`, the memory and Prisma adapters, and `documentRowToDomain` carry the new fields.

### 8. Schema and release

- Add the fields to `packages/cli/templates/v0/invoicing.prisma`. The test fixture copies this template.
- Add the fields to the memory adapter.
- Bump both packages to **0.17.0**. The release notes say:
  - Add the nullable columns and migrate **before** upgrading.
  - The default policy is unchanged (legacy).
  - Opt into `RECOMMENDED_MONEY_POLICY` and an `ExchangeRateProvider` explicitly.
- Existing documents keep their stored amounts. They are recomputed under their recorded (legacy) policy only when edited.

## Testing

- **Rounding matrix** for `roundScaled`: every mode × positive/negative × exact/.5/non-.5 cases.
- **Allocation:** exact sums, determinism, zero weights, a single line, negative totals.
- **Calculator goldens:**
  - Legacy policy reproduces today's outputs byte-for-byte, except fractional FIXED rates (§2 rule 4), as a regression guard on the old math.
  - Recommended policy: 1.5 × 3.33 = 5.00 (half-up of 4.995). A 3-line document with 18% at document level, where the lines' tax sum equals `round(Σbase × 18%)`.
  - USD 1,000 @ 59.3470 → base 59,347.00 / 10,682.46 / 70,029.46.
- **Property tests:** the §2 invariants over random documents, every policy, with and without exchange.
- **Services:**
  - A draft saves without a rate.
  - Issue with the provider; a missing rate returns 422 and the document stays a draft.
  - A manual rate wins; identity for the base currency.
  - A note inherits its reference's rate and policy; a currency mismatch is rejected.
  - Frozen after issue; a line edit recomputes under the frozen rate and recorded policy.
  - No provider or policy → legacy behavior and null fields.
- **Conformance:** the memory and Prisma adapters round-trip every new field.
- **Integration:** the Prisma template migration applies cleanly on top of 0.16.0.

## Rollout

1. Kit PR: spec, `src/lib/money/*`, types, services, schemas, the calculate route, adapters, template, tests. Release 0.17.0.
2. The consumer adds the columns and migrates, then upgrades, sets its policy, and wires a provider (domingo-api spec).
3. The consumer backfills existing issued non-base documents' rate and base amounts. It uses the exported `allocate` so the line and tax splits sum exactly to the base totals its own ledger already posted, and never changes a posted number.
