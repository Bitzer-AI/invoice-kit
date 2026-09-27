# invoicing-kit

[![npm version](https://img.shields.io/npm/v/invoicing-kit.svg)](https://www.npmjs.com/package/invoicing-kit)
[![license](https://img.shields.io/npm/l/invoicing-kit.svg)](./LICENSE)

Drop-in invoicing API for [Hono](https://hono.dev) apps using [better-auth](https://better-auth.com). Mount one router and get organization-scoped clients, products, taxes, payment methods, quotes, invoices, and payments — backed by Prisma (or your own repository implementation).

## Features

- **One-line mount** — `app.route("/", kit.router)` adds the full REST surface.
- **Organization-scoped** — every resource is isolated per better-auth organization.
- **Quotes → invoices** — convert an accepted quote into an invoice in one call.
- **Payments** — record manual payments and track invoice paid / partially-paid state.
- **Catalog by reference** — link line items to your own domain objects (an experience, course, plan…) and the kit find-or-creates the backing product.
- **Money-safe** — amounts are integer minor units, rates/quantities are decimal strings; no floats cross the boundary.
- **Pluggable storage** — ships a Prisma adapter and an in-memory test adapter; bring your own by implementing the repository interfaces.
- **Typed & validated** — Zod schemas on every route, OpenAPI metadata included.

## Install

```bash
bun add invoicing-kit
# peer deps:
bun add @prisma/client better-auth hono @hono/zod-openapi zod
```

## Quick start

```ts
import { createInvoicingKit, prismaAdapter } from "invoicing-kit";
import { Hono } from "hono";
import { PrismaClient } from "@prisma/client";
import { auth } from "./auth"; // your better-auth instance with the organization plugin

const prisma = new PrismaClient();

const kit = createInvoicingKit({
  adapter: prismaAdapter(prisma),
  auth,
  basePath: "/api/bills", // default: "/api/bills"
});

const app = new Hono();
app.route("/", kit.router);
app.route("/api/auth", auth.handler); // your own better-auth mount

export default app;
```

### Configuration

`createInvoicingKit(config)` accepts:

| Option     | Type           | Description                                               |
| ---------- | -------------- | --------------------------------------------------------- |
| `adapter`  | `Repositories` | Storage backend. Use `prismaAdapter(prisma)` or your own. |
| `auth`     | better-auth    | Instance with the organization plugin enabled.            |
| `basePath` | `string`       | Mount path for the router. Default `"/api/bills"`.        |

It returns `{ router, services, repos }` — mount `router`, or call `services` / `repos` directly for server-side work.

## Routes

Mounted under `basePath`:

| Resource        | Routes                                                               |
| --------------- | ------------------------------------------------------------------- |
| Clients         | `POST/GET/GET/PATCH/DELETE /clients[/:id]`                           |
| Products        | `POST/GET/GET/PATCH/DELETE /products[/:id]`                          |
| Taxes           | `POST/GET/GET/PATCH/DELETE /taxes[/:id]`                             |
| Payment methods | `POST/GET/GET/PATCH/DELETE /payment-methods[/:id]`                   |
| Quotes          | `POST/GET/GET/PATCH/DELETE /quotes[/:id]`                            |
| Invoices        | `POST/GET/GET/PATCH/DELETE /invoices[/:id]`                          |
| Convert         | `POST /invoices/from-quote/:quoteId`                                 |
| Payments        | `POST/GET /invoices/:invoiceId/payments`, `GET/DELETE /payments/:id` |

## Money units

Values cross the API boundary as strings to avoid floating-point drift:

- **Amounts** (`price`, `amount`, invoice totals) — integer **minor units** (cents), e.g. `"5000"` for $50.00.
- **Rates / quantities** — canonical decimal strings, e.g. `"1.5"`, `"18"`.

Your application converts to/from display units at its own edge.

## Money policy & exchange rates

By default the kit keeps its pre-0.17 math (`LEGACY_MONEY_POLICY`): line subtotals and per-line tax are **truncated**, and documents never carry a rate or base-currency amounts. The policy and the rates below are opt-in, but upgrading is not a no-op: a few behaviors change even with no configuration (see [Behavior changes in 0.17.0](#behavior-changes-in-0170)).

### `moneyPolicy`

```ts
import { createInvoicingKit, RECOMMENDED_MONEY_POLICY } from "invoicing-kit";

const kit = createInvoicingKit({
  adapter: prismaAdapter(prisma),
  auth,
  moneyPolicy: () => RECOMMENDED_MONEY_POLICY, // default: LEGACY_MONEY_POLICY
});
```

`moneyPolicy` is a per-organization function: `(ctx: { organizationId: string }) => MoneyPolicy | Promise<MoneyPolicy>`. A `MoneyPolicy` is:

```ts
interface MoneyPolicy {
  rounding: RoundingMode;       // "half_up" | "half_even" | "truncate"
  taxLevel: TaxLevel;           // "line" | "document"
  baseTaxMethod: BaseTaxMethod; // "recompute" | "convert"
}
```

- The function must return a valid `MoneyPolicy`; anything else throws `invoicing-kit: moneyPolicy returned an invalid policy: …` (a configuration error), never computes with it.
- `LEGACY_MONEY_POLICY` — `{ rounding: "truncate", taxLevel: "line", baseTaxMethod: "recompute" }`. The default. `truncate` is **lossy** (it drops fractions instead of rounding them) and exists only to reproduce pre-0.17 output (fractional `FIXED` rates aside, see below); don't pick it for a new tenant.
- `RECOMMENDED_MONEY_POLICY` — `{ rounding: "half_up", taxLevel: "document", baseTaxMethod: "recompute" }`. Use this for new tenants.
- An issued document freezes the policy it was computed under (`document.moneyPolicy`), so a later change to your `moneyPolicy` function never reshapes an already-issued document. Drafts always recompute under the organization's *current* policy on every write.

The same rules power `calculateDocument`, `allocate`, `roundDiv`, `parseScaled`, and `canonicalDecimal`, all exported from `invoicing-kit` for consumers that need their own previews (e.g. an editor).

### `exchangeRates`

```ts
import type { ExchangeRateProvider } from "invoicing-kit";

const exchangeRates: ExchangeRateProvider = {
  baseCurrency: ({ organizationId }) => "dop", // your tenant's reporting currency
  resolve: async ({ organizationId, from, to, date }) => {
    // return base units per 1 `from` unit effective on `date`, or null when unknown
    return myRateStore.lookup(organizationId, from, to, date);
  },
};

const kit = createInvoicingKit({ adapter: prismaAdapter(prisma), auth, moneyPolicy: () => RECOMMENDED_MONEY_POLICY, exchangeRates });
```

The kit never fetches rates itself — it only calls your provider. Contract:

- `resolve` returns `null` when no rate is known for that date. The kit turns that into **`422 EXCHANGE_RATE_REQUIRED`** at issue time; the document stays a draft and nothing is written. A rate ≤ 0 is treated the same as `null`.
- A **thrown** error (e.g. your rate store is down) propagates unchanged, so an outage is never disguised as a missing rate.
- A rate is a decimal string with at most 8 decimals. Anything else is a contract violation: the kit throws a `RangeError`, at issue and in the `/documents/calculate` preview alike. Currency conversion always rounds **half-up**, regardless of `policy.rounding`.
- `baseCurrency` returns a 3-letter currency code (any case; surrounding spaces are trimmed). Anything else throws an `Error`.
- With no `exchangeRates` configured, documents never carry a rate or base amounts — the feature is off.

### When the rate is set and frozen

| Document | Rule |
|---|---|
| **Draft** invoice / bill | Always saves, with or without a rate. It may carry a `manual` rate (the partner's own). With no manual rate, nothing is resolved until issue. |
| **Issue** (created non-draft, or draft → non-draft) | Precedence: the document's `manual` rate, then `identity` (same currency as base), then `provider.resolve(date = issueDate)`. No rate → `422 EXCHANGE_RATE_REQUIRED` and the document stays a draft. The rate and base amounts are written in the same transaction as the status change. |
| Credit / debit note with `referencedDocumentId` | Inherits the referenced document's `exchangeRate`, `baseCurrency`, `exchangeRateDate`, and policy (source `referenced`). A note's own manual rate is ignored once its reference carries a rate. Currency must match the referenced document's → `422 CURRENCY_MISMATCH`. |
| Quote | May carry a `manual` rate: the partner's own agreed rate. It's never frozen. Converting a quote to an invoice carries that rate onto the invoice draft, where the partner can clear it (`exchangeRate: null`) before issue; the invoice freezes its rate at its own issue. |
| After issue | The rate fields are **immutable**. Updating an issued document's lines recomputes the document and base amounts under the frozen rate and the document's recorded policy. |

### `POST /documents/calculate`

A stateless preview — it never writes. Returns `calculateDocument`'s output for a body of line items under the organization's policy, so consumers don't need to reimplement the math for an editor preview.

The preview resolves its rate with the same precedence as issuing a document — manual → identity → provider — so a manual `exchangeRate` sent for a base-currency document (or with no provider configured) is rejected with `422 EXCHANGE_RATE_NOT_APPLICABLE`, exactly like sending one on an invoice/quote/vendor-bill body; it is never silently downgraded to an identity rate.

```http
POST /api/bills/documents/calculate
{ "currency": "USD", "issueDate": "2026-09-25", "lineItems": [{ "quantity": "1", "price": "100000", "taxIds": ["<taxId>"] }] }
```

```jsonc
{
  "currency": "usd",
  "subtotal": "100000", "tax": "18000", "total": "118000",
  "lines": [{ "subtotal": "100000", "taxAmount": "18000", "total": "118000", "baseSubtotal": "5934700" }],
  "taxTotals": [{ "taxId": "…", "amount": "18000", "baseAmount": "1068246" }],
  "exchange": { "baseCurrency": "dop", "rate": "59.347", "rateDate": "2026-09-25", "source": "provider" },
  "base": { "subtotal": "5934700", "tax": "1068246", "total": "7002946" }
}
```

`exchange` and `base` are `null` when no `exchangeRates` provider is configured, or when the provider has no rate for `issueDate` (`null` or a rate ≤ 0) — a missing rate is **never an error** on this endpoint, unlike issuing a document. A malformed provider rate is an error: the same `RangeError` as at issue.

### Upgrading to 0.17.0

1. **Add the nullable columns and migrate — before installing 0.17.0.** `documents`: `money_policy` (json), `base_currency` (varchar 3), `exchange_rate` (decimal 18,8), `exchange_rate_date` (date), `exchange_rate_source` (varchar 16), `base_subtotal`, `base_tax`, `base_total` (bigint). `document_line_items`: `base_subtotal` (bigint). `document_line_item_taxes`: `base_tax_amount` (bigint). All nullable, so existing rows are untouched. If you generate your schema from `@invoicing-kit/cli`, regenerate from the 0.17.0 template and run your migration before bumping the package version.

2. **Data step — right after adding the columns, before upgrading the package:** stamp every already-issued document with the legacy policy, so its stored amounts stay pinned to the math they were actually computed under:

   ```sql
   UPDATE documents d
   SET money_policy = '{"rounding":"truncate","taxLevel":"line","baseTaxMethod":"recompute"}'::jsonb
   WHERE d.money_policy IS NULL
     AND (
       EXISTS (SELECT 1 FROM invoices i WHERE i.document_id = d.id AND i.status <> 'draft')
       OR EXISTS (SELECT 1 FROM vendor_bills vb WHERE vb.document_id = d.id AND vb.status <> 'draft')
       OR EXISTS (SELECT 1 FROM notes n WHERE n.document_id = d.id AND n.status <> 'draft')
     );
   ```

   Quotes are excluded — a quote is never "issued" in the money-policy sense; it has no frozen amounts to protect. Without this step, an issued pre-0.17 document that later gets moved back to draft (or a note filed against it) would be recomputed under whatever policy is current at that moment, silently drifting its numbers away from what was actually invoiced/filed. Stamping `money_policy` up front keeps it pinned to `LEGACY_MONEY_POLICY` forever, and makes any note against it inherit the same legacy math via the `referenced` exchange source.

3. **Custom repository adapters only:** the domain types gained required fields. A custom adapter must return them on every read — `Document`: `moneyPolicy`, `baseCurrency`, `exchangeRate`, `exchangeRateDate`, `exchangeRateSource`, `baseSubtotal`, `baseTax`, `baseTotal`; `DocumentLineItem`: `baseSubtotal`; `DocumentLineItemTax`: `baseTaxAmount` (each `null` when absent) — and store them from `NewDocument` / `NewDocumentLineItem` / `DocumentUpdate`, not only `DocumentUpdate.moneyPolicy`. The bundled memory and Prisma adapters already do.

4. **Upgrade the package**, then opt in explicitly — the default stays legacy:

   ```ts
   const kit = createInvoicingKit({
     adapter: prismaAdapter(prisma),
     auth,
     moneyPolicy: () => RECOMMENDED_MONEY_POLICY,
     exchangeRates: myRateProvider,
   });
   ```

### Backfilling exchange data on issued documents

A consumer that backfills rates and base amounts onto documents issued before 0.17 must write the whole set together, on each document:

- all four rate columns — `base_currency`, `exchange_rate`, `exchange_rate_date` and `exchange_rate_source`;
- the base totals — `base_subtotal`, `base_tax`, `base_total`;
- the per-line base values — `document_line_items.base_subtotal` and `document_line_item_taxes.base_tax_amount`.

The kit reads a document's rate only when all four rate columns are set. With any one missing, it treats the document as having no rate, and a later line edit recomputes it without one and nulls its base amounts. Split the base totals over lines and taxes with the exported `allocate`, so the line and tax parts sum exactly to the base totals your ledger already posted.

### Behavior changes in 0.17.0

**Even with no `moneyPolicy` or `exchangeRates` configured:**

- Notes default to their referenced document's currency; a different currency → `422 CURRENCY_MISMATCH`. A note cannot override a referenced document's frozen rate → `422 EXCHANGE_RATE_NOT_APPLICABLE`.
- A fractional `FIXED` tax rate is now honored (pre-0.17 truncated it to its integer part).
- Draft invoices, vendor bills and notes are recomputed on every write, from their stored lines (each keeps its product) and the *current* tax rates, under the organization's current policy. Their line-item rows are replaced, so line-item ids change on each draft save.
- Quotes recompute only when a write carries `lineItems` or `exchangeRate`. A status-only or notes-only edit keeps the stored amounts and line ids.
- Converting a quote recomputes its lines under the current policy (each line keeps its product) and carries the quote's manual rate to the invoice draft.
- Recording a payment that moves a draft invoice/vendor bill to paid or partially paid **issues it**: the policy (and, with a provider, the rate) is frozen at that point. After commit it fires `onInvoiceIssued` / `onVendorBillRecorded` **before** `onPaymentSucceeded` / `onVendorBillPaymentSucceeded`, because a ledger posts the document before its payment. With a provider configured and no rate for the issue date, the payment is rejected with `422 EXCHANGE_RATE_REQUIRED`.
- Deleting a payment from a draft (a $0 payment never issues it) leaves the document a draft.
- `calculateDocument` rejects a document whose line subtotals mix positive and negative amounts (throws `RangeError`).

**Configuration and adapters:**

- A `moneyPolicy` function that returns anything but a valid `MoneyPolicy` throws instead of computing with it.
- After issue the rate is immutable. Changing an issued document's issue date keeps the frozen rate — void and re-issue the document to change it.
- `DocumentUpdate.moneyPolicy` (the repository adapter type) is set-once: it accepts a `MoneyPolicy`, never `null`. A custom repository adapter must store it as JSON, and must return every new field (upgrade step 3).
- Provider contract, restated: return `null` when no rate is known (→ `422 EXCHANGE_RATE_REQUIRED`); a thrown error propagates unchanged; rates must have at most 8 decimals.

## Payment methods & providers

A payment method's `type` and a payment's `provider` are free-form strings — `"STRIPE"`, `"MANUAL"`, and `"AZUL"` are the conventional values, but any gateway string is accepted, so you can support regional providers without a library change. Constrain the set in your own app if you need to.

## Linking products to your domain objects

A line item normally references an existing product by `productId`. It can instead reference one of your own domain objects (an experience, course, plan, …) via `source`, and the kit find-or-creates the backing product for you — keyed on `(organization, sourceType, sourceId)`:

```jsonc
// reference a product directly
{ "productId": "…", "quantity": "1", "price": "5000", "taxIds": [] }

// reference your own object; product is created on first use
{ "source": { "type": "experience", "id": "42", "name": "Sunset Tour" },
  "quantity": "2", "price": "5000", "taxIds": [] }
```

Provide exactly one of `productId` / `source`. The product is created once (price defaults from the line item's minor units) and reused on later sales; the line item still carries its own `price` / `description`, so it remains the immutable snapshot of the sale. `Product` exposes the same `sourceType` / `sourceId` on create and read for catalog lookups.

Documents are single-currency: every line item's product must be denominated in the document's `currency` (compared case-insensitively; stored lowercase). Auto-created source products inherit the document currency; referencing a product priced in another currency fails with `422 LINE_ITEM_CURRENCY_MISMATCH`. Each line item also records a `currency` snapshot, and products accept an optional `currency` (ISO 4217, default `usd`) on create/update.

## Sale vs. purchase products

Each product carries a `usage` of `SALE`, `PURCHASE`, or `BOTH` (default `BOTH`) — which side of the ledger it may appear on. Sales documents (invoices, quotes, credit notes) accept `SALE`/`BOTH` products; purchase documents (vendor bills, debit notes) accept `PURCHASE`/`BOTH`. Referencing a product whose `usage` excludes the document's side fails with `422 PRODUCT_NOT_SELLABLE` or `422 PRODUCT_NOT_PURCHASABLE`. A product created from a `source` line inherits the side it was first used on. List with `?usage=SALE` / `?usage=PURCHASE` to fetch only the products valid for a side (the filter returns that side plus `BOTH`). Products also accept an optional `cost` (purchase unit price, decimal) independent of the sale `price`.

## Testing

The `invoicing-kit/testing` entry point exports an in-memory adapter so you can exercise the full router without a database:

```ts
import { createInvoicingKit } from "invoicing-kit";
import { inMemoryAdapter } from "invoicing-kit/testing";

const kit = createInvoicingKit({ adapter: inMemoryAdapter(), auth, basePath: "/api/bills" });
```

## License

MIT © [Bitzer AI](https://github.com/Bitzer-AI)
