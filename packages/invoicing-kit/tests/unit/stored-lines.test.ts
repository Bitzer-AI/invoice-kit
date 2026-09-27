import { describe, expect, test } from "vitest";
import { inMemoryAdapter } from "../../src/adapters/memory";
import { buildServices } from "../../src/services";
import { buildMoneySettings } from "../../src/lib/money/settings";
import { RECOMMENDED_MONEY_POLICY } from "../../src/lib/money";
import { InvoiceStatus, ProductUsage, QuoteStatus } from "../../src/types";
import type { AuthContext } from "../../src/auth/types";

const ctx: AuthContext = { userId: "u", organizationId: "org", role: null };

async function setup() {
  const repos = inMemoryAdapter();
  const services = buildServices(
    repos,
    undefined,
    buildMoneySettings({
      moneyPolicy: () => RECOMMENDED_MONEY_POLICY,
      exchangeRates: { baseCurrency: () => "dop", resolve: async () => "59.347" },
    }),
  );
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
  const stopSelling = async (productId: string) =>
    repos.products.update(productId, "org", { usage: ProductUsage.Purchase });
  return { repos, services, body, tax, stopSelling };
}

describe("recomputing stored lines never re-resolves their products", () => {
  test("a notes-only edit of a draft invoice succeeds after its product stops being sellable", async () => {
    const { services, body, stopSelling } = await setup();
    const draft = await services.invoices.create(body(), ctx);
    const before = (await services.invoices.findById(draft.id, ctx)).document;
    await stopSelling(before.lineItems[0]!.productId);

    await services.invoices.update(draft.id, { notes: "Pickup at 8" } as any, ctx);

    const after = (await services.invoices.findById(draft.id, ctx)).document;
    expect(after.notes).toBe("Pickup at 8");
    expect(after.lineItems[0]!.productId).toBe(before.lineItems[0]!.productId);
    expect(after.total).toBe(118_000n);
  });

  test("the draft still issues after its product stops being sellable", async () => {
    const { services, body, stopSelling } = await setup();
    const draft = await services.invoices.create(body(), ctx);
    await stopSelling((await services.invoices.findById(draft.id, ctx)).document.lineItems[0]!.productId);

    await services.invoices.update(draft.id, { status: InvoiceStatus.Sent } as any, ctx);

    const issued = await services.invoices.findById(draft.id, ctx);
    expect(issued.status).toBe(InvoiceStatus.Sent);
    expect(issued.document.exchangeRate).toBe("59.347");
  });

  test("bulk status and a payment issue drafts whose product stopped being sellable", async () => {
    const { services, body, stopSelling } = await setup();
    const bulk = await services.invoices.create(body(), ctx);
    const paid = await services.invoices.create(body(), ctx);
    await stopSelling((await services.invoices.findById(bulk.id, ctx)).document.lineItems[0]!.productId);

    await services.invoices.bulkUpdateStatus([bulk.id], InvoiceStatus.Sent, ctx);
    await services.payments.recordManualPayment(paid.id, { amount: "118000", currency: "usd", provider: "manual" } as any, ctx);

    expect((await services.invoices.findById(bulk.id, ctx)).status).toBe(InvoiceStatus.Sent);
    expect((await services.invoices.findById(paid.id, ctx)).status).toBe(InvoiceStatus.Paid);
  });

  test("a quote converts after its product stops being sellable", async () => {
    const { services, body, stopSelling } = await setup();
    const quote = await services.quotes.create(body({ status: QuoteStatus.Sent }), ctx);
    const quoteDoc = (await services.quotes.findById(quote.id, ctx)).document;
    await stopSelling(quoteDoc.lineItems[0]!.productId);

    const invoice = await services.invoices.convertFromQuote(quote.id, {} as any, ctx);

    const invoiceDoc = (await services.invoices.findById(invoice.id, ctx)).document;
    expect(invoiceDoc.lineItems[0]!.productId).toBe(quoteDoc.lineItems[0]!.productId);
    expect(invoiceDoc.total).toBe(118_000n);
  });
});

describe("quotes recompute only when their lines or rate change", () => {
  test("a status-only change keeps the totals and line ids after a catalog tax change", async () => {
    const { repos, services, body, tax } = await setup();
    const quote = await services.quotes.create(body({ status: QuoteStatus.Sent }), ctx);
    const before = (await services.quotes.findById(quote.id, ctx)).document;
    expect(before.total).toBe(118_000n);
    await repos.taxes.update(tax.id, "org", { rate: "0.16" });

    await services.quotes.update(quote.id, { status: QuoteStatus.Accepted } as any, ctx);

    const after = await services.quotes.findById(quote.id, ctx);
    expect(after.status).toBe(QuoteStatus.Accepted);
    expect(after.document.total).toBe(118_000n);
    expect(after.document.lineItems.map((line) => line.id)).toEqual(before.lineItems.map((line) => line.id));
  });

  test("a line edit still recomputes under the current catalog", async () => {
    const { repos, services, body, tax } = await setup();
    const quote = await services.quotes.create(body({ status: QuoteStatus.Sent }), ctx);
    await repos.taxes.update(tax.id, "org", { rate: "0.16" });

    await services.quotes.update(quote.id, { lineItems: body().lineItems } as any, ctx);

    expect((await services.quotes.findById(quote.id, ctx)).document.total).toBe(116_000n);
  });
});
