# v0.17.0 — Money policy and document exchange rates

`invoicing-kit` and `@invoicing-kit/cli` move together to **0.17.0**.

## Highlights

- **Configurable money policy.** Rounding (`half_up` / `half_even` / `truncate`), where tax is rounded (`line` / `document`), and how base-currency tax is derived (`recompute` / `convert`) are now per-organization, via a new `moneyPolicy` option. The default policy is unchanged — `LEGACY_MONEY_POLICY` (today's `truncate` + line-level math) — so issued totals keep today's math. Upgrading is **not** a no-op, though: a few behaviors change even with no configuration (see [Behavior changes](#behavior-changes)). `RECOMMENDED_MONEY_POLICY` is available for new tenants.
- **Document exchange rates.** A document issued in a currency other than the tenant's base currency now records the rate it was issued at and its amounts in the base currency, computed once and frozen. Wire it up with a new `exchangeRates` provider option; the kit never calls the network itself.
- **`calculateDocument`, `allocate`, `roundDiv`, `parseScaled`, `canonicalDecimal`** are now public exports of `invoicing-kit`, along with the `MoneyPolicy` / `ExchangeRateProvider` types and the `RoundingMode`, `TaxLevel`, `BaseTaxMethod`, `ExchangeRateSource` enums — so a consumer's editor preview uses the same math the kit uses, instead of a hand-rolled copy.
- **New endpoint: `POST {basePath}/documents/calculate`.** A stateless preview of a document's totals and base amounts under the organization's policy. Never writes; a missing exchange rate (the provider returns `null` or a rate ≤ 0) just means `base: null`, never an error. A malformed provider rate is the same `RangeError` as at issue.

## Upgrade steps (in order)

1. **Add the nullable columns and migrate — before installing 0.17.0.**
   - `documents`: `money_policy` (json), `base_currency` (varchar 3), `exchange_rate` (decimal 18,8), `exchange_rate_date` (date), `exchange_rate_source` (varchar 16), `base_subtotal`, `base_tax`, `base_total` (bigint).
   - `document_line_items`: `base_subtotal` (bigint).
   - `document_line_item_taxes`: `base_tax_amount` (bigint).
   - All nullable, so existing rows are untouched. If your schema is generated from `@invoicing-kit/cli`, regenerate from the 0.17.0 `invoicing.prisma` template and run your migration first.

2. **Data step — right after adding the columns, before upgrading the package.** Stamp every already-issued document with the legacy policy, so its stored amounts stay pinned to the math they were actually computed under:

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

   Table and column names, and the `draft` status literal, are taken from `packages/cli/templates/v0/invoicing.prisma` and `src/types.ts` (`InvoiceStatus.Draft`, `VendorBillStatus.Draft`, `NoteStatus.Draft` all serialize to `"draft"`). Quotes are excluded — a quote has no frozen amounts to protect.

   Why: issued pre-0.17 documents were computed under the legacy policy. Recording `money_policy` on them keeps them frozen to that policy even if one is later set back to draft (drafts recompute under the *current* org policy on every write), and it means a credit/debit note filed against one of them inherits the same legacy math through the `referenced` exchange source. Skipping this step risks an old document's numbers silently drifting once your org switches to `RECOMMENDED_MONEY_POLICY`.

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

## Backfilling exchange data on issued documents

A consumer that backfills rates and base amounts onto documents issued before 0.17 must write the whole set together, on each document:

- all four rate columns — `base_currency`, `exchange_rate`, `exchange_rate_date` and `exchange_rate_source`;
- the base totals — `base_subtotal`, `base_tax`, `base_total`;
- the per-line base values — `document_line_items.base_subtotal` and `document_line_item_taxes.base_tax_amount`.

The kit reads a document's rate only when all four rate columns are set. With any one missing, it treats the document as having no rate, and a later line edit recomputes it without one and nulls its base amounts. Split the base totals over lines and taxes with the exported `allocate`, so the line and tax parts sum exactly to the base totals your ledger already posted.

## Exchange-rate provider contract

```ts
interface ExchangeRateProvider {
  baseCurrency(ctx: { organizationId: string }): string | Promise<string>;
  resolve(ctx: { organizationId: string; from: string; to: string; date: Date }): Promise<string | null>;
}
```

- Return `null` when no rate is known for that date → the kit turns it into `422 EXCHANGE_RATE_REQUIRED` at issue time; the document stays a draft and nothing is written. A rate ≤ 0 is treated the same as `null`.
- A thrown error propagates unchanged — an outage is never disguised as a missing rate.
- Rates must be decimal strings with at most 8 decimals. Anything else is a contract violation: the kit throws a `RangeError`, at issue and in the `/documents/calculate` preview alike. Currency conversion always rounds half-up, regardless of `policy.rounding`.
- `baseCurrency` must return a 3-letter currency code (any case; surrounding spaces are trimmed). Anything else throws an `Error`.

## When the rate is set and frozen

| Document | Rule |
|---|---|
| **Draft** invoice / bill | Always saves, with or without a rate. May carry a `manual` rate. With no manual rate, nothing is resolved until issue. |
| **Issue** (created non-draft, or draft → non-draft) | Precedence: `manual` rate, then `identity` (same currency as base), then `provider.resolve(date = issueDate)`. No rate → `422 EXCHANGE_RATE_REQUIRED`, document stays a draft. Rate and base amounts are written in the same transaction as the status change. |
| Credit / debit note with `referencedDocumentId` | Inherits the referenced document's rate, base currency, rate date, and policy (source `referenced`). A note's own manual rate is ignored once its reference carries a rate. Currency must match → `422 CURRENCY_MISMATCH`. |
| Quote | May carry a `manual` rate: the partner's own agreed rate. Never frozen. Converting a quote carries that rate onto the invoice draft, where the partner can clear it (`exchangeRate: null`) before issue; the invoice freezes its rate at its own issue. |
| After issue | Rate fields are immutable. Updating an issued document's lines recomputes it under the frozen rate and its recorded policy. |

## Behavior changes

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

- A `moneyPolicy` function that returns anything but a valid `MoneyPolicy` throws `invoicing-kit: moneyPolicy returned an invalid policy: …` instead of computing with it.
- After issue the rate is immutable. Changing an issued document's issue date keeps the frozen rate — void and re-issue the document to change it.
- `DocumentUpdate.moneyPolicy` (the repository adapter type) is set-once: it accepts a `MoneyPolicy`, never `null`. A custom repository adapter must store it as JSON, and must return every new field (upgrade step 3).
- Provider contract, restated: return `null` when no rate is known (→ `422 EXCHANGE_RATE_REQUIRED`); a thrown error propagates unchanged; rates must have at most 8 decimals.

- **Issued notes settle the document they reference.** An issued credit note counts toward an invoice or vendor bill like a payment; an issued debit note adds to what is owed (drafts count for nothing). A payment is rejected (`PAYMENT_AMOUNT_EXCEEDS_INVOICE_TOTAL` / `VENDOR_BILL_PAYMENT_EXCEEDS_TOTAL`) when it would exceed total − payments − credits + debits, and the status follows the same sum: **paid** when settled (a full credit note alone settles an invoice), **partially paid** only when money was paid, otherwise **sent** / **received**. It is re-derived whenever a payment is recorded or deleted and whenever an issued note is created, issued, edited or deleted. A custom repository adapter must implement `NoteRepository.netSettlementFor(referencedDocumentId, organizationId)`.
- **A note's side follows its party.** A vendor's credit or debit note is a purchase document and a client's is a sale, for the product-usage check; before, every debit note counted as a purchase and every credit note as a sale.

- **Payments accept a `paidAt` with a UTC offset.** `POST /invoices/{id}/payments` and `POST /vendor-bills/{id}/payments` now take any ISO-8601 datetime, including `2026-09-25T12:00:00-04:00`; before, only UTC (`Z`) datetimes passed validation.

## Docs

Full reference: [`packages/invoicing-kit/README.md`](./packages/invoicing-kit/README.md#money-policy--exchange-rates), "Money policy & exchange rates".
