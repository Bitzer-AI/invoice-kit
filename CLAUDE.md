# CLAUDE.md

Guidance for Claude Code when working in this repository.

## Project

`invoicing-kit` — an embeddable invoicing/billing engine (Hono + Zod OpenAPI routes,
Prisma/in-memory adapters). Workspace packages live in `packages/` (`invoicing-kit`, `cli`).

Commands (from `packages/invoicing-kit`): `bun run typecheck`, `bunx vitest run tests/unit`.
Integration tests (`tests/integration`) need a Postgres + a generated Prisma client
(`bun run db:push`); the unit suite runs against the in-memory adapter with no DB.

## No magic literals for domain vocabulary

Domain vocabulary — document types, statuses, sides, product usage, tax types, payment
statuses, the default currency — must NEVER appear as inline string literals in code.
Use the named constants; a bare `"draft"`, `"INVOICE"`, `"SALE"`, `"usd"`, etc. in logic is a defect.

**Single source of truth:** the const-enums in `src/types.ts` (each is a `const` object whose
derived type shares its name) and `DEFAULT_CURRENCY` in `src/lib/currency.ts`.

```ts
// ✗ never
if (invoice.status !== "draft") { ... }
const currency = normalizeCurrency(body.currency ?? "usd");
status: "paid",
resolveLineItemProduct(tx, orgId, lineItem, currency, "SALE");

// ✓ always
import { InvoiceStatus, DocumentSide } from "../../types";
import { DEFAULT_CURRENCY } from "../../lib/currency";
if (invoice.status !== InvoiceStatus.Draft) { ... }
const currency = normalizeCurrency(body.currency ?? DEFAULT_CURRENCY);
status: InvoiceStatus.Paid,
resolveLineItemProduct(tx, orgId, lineItem, currency, DocumentSide.Sale);
```

In Zod schemas, build from the enum — never re-type the literal array or a literal default:

```ts
// ✗ never
status: z.enum(["draft", "sent", "paid", "partially_paid"]).default("draft"),
// ✓ full set
status: z.nativeEnum(InvoiceStatus).default(InvoiceStatus.Draft),
// ✓ subset
status: z.enum([InvoiceStatus.Draft, InvoiceStatus.Sent, InvoiceStatus.Paid]),
```

When you add a value to a domain enum, add it to the `const` object in `src/types.ts` only;
every schema and comparison that derives from it updates for free.

**Scope:** this rule covers the domain enums listed above. Purely local schema vocabularies
that are not domain enums — sort fields, `"asc"`/`"desc"`, `"true"`/`"false"`, the note `party`
filter — may remain inline `z.enum([...])`. If one of those grows into a reused domain concept,
promote it to a `src/types.ts` const-enum first.

`taxIdType` (clients, vendors) and `fiscalCategory` (taxes) are free text, never an enum. The host
application owns their values, because they depend on the country of the firm. Do not add a
country, a tax name or a tax id name to the kit.

## Other conventions

- Currency codes are stored/compared lowercase; always route through `normalizeCurrency`.
- The minor unit digits of a currency come from `currencyMinorUnitDigits` in `src/lib/currency.ts`.
  Never write `100`, `toFixed(2)` or a two-decimal pattern in money code.
- The digits are ISO 4217 data in `NON_DEFAULT_CURRENCY_MINOR_UNIT_DIGITS`, with the default
  `DEFAULT_CURRENCY_MINOR_UNIT_DIGITS` for every other code. Never read a digit count, or any other
  value that is stored, sent or compared, from `Intl`: it is data of the engine and differs between
  engines.
- A tax rate holds `TAX_RATE_SCALE` decimals (`src/lib/money/decimal.ts`). The Zod pattern, the
  calculation, the stored format and the column type follow that constant.
- A line item references exactly one of `productId` or `source` (enforced by `lineItemSchema`).
- Adapters mirror behavior: the in-memory adapter filters arrays, the Prisma adapter filters
  in SQL — keep both in sync when changing query semantics.
- The real DB schema lives in the consumer app; this repo carries the Prisma **test fixture**
  (`tests/fixtures/prisma`) and the **CLI scaffold template** (`packages/cli/templates/v0`).
  A schema change must be applied to both, and the consumer must run its own migration.
