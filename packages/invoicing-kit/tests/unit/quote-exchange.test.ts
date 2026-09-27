import { describe, expect, test } from "vitest";
import { inMemoryAdapter } from "../../src/adapters/memory";
import { buildServices } from "../../src/services";
import { buildMoneySettings } from "../../src/lib/money/settings";
import { LEGACY_MONEY_POLICY, RECOMMENDED_MONEY_POLICY } from "../../src/lib/money";
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

  test("a base-currency quote cannot carry a manual rate", async () => {
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
    await expect(
      services.quotes.create(
        {
          clientId: client.id,
          issueDate: "2026-09-25",
          currency: "dop",
          status: QuoteStatus.Draft,
          exchangeRate: "2",
          paymentMethodIds: [],
          lineItems: [{ source: { type: "experience", id: "tour", name: "Tour" }, quantity: "1", price: "5000", taxIds: [] }],
        } as any,
        ctx,
      ),
    ).rejects.toThrow(/EXCHANGE_RATE_NOT_APPLICABLE/);
  });

  test("clearing a quote's manual rate on update", async () => {
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
        status: QuoteStatus.Draft,
        exchangeRate: "60",
        paymentMethodIds: [],
        lineItems: [{ source: { type: "experience", id: "tour", name: "Tour" }, quantity: "1", price: "5000", taxIds: [] }],
      } as any,
      ctx,
    );
    expect((await services.quotes.findById(quote.id, ctx)).document.exchangeRate).toBe("60");

    await services.quotes.update(quote.id, { exchangeRate: null } as any, ctx);
    const doc = (await services.quotes.findById(quote.id, ctx)).document;
    expect(doc.exchangeRate).toBeNull();
    expect(doc.exchangeRateSource).toBeNull();
    expect(doc.baseCurrency).toBeNull();
  });

  test("a quote line edit recomputes under the org's current policy; other edits keep its amounts", async () => {
    let policy: typeof LEGACY_MONEY_POLICY | typeof RECOMMENDED_MONEY_POLICY = LEGACY_MONEY_POLICY;
    const repos = inMemoryAdapter();
    const services = buildServices(repos, undefined, buildMoneySettings({ moneyPolicy: () => policy }));
    const client = await repos.clients.create({ organizationId: "org", name: "Agency" });
    const quote = await services.quotes.create(
      {
        clientId: client.id,
        issueDate: "2026-09-25",
        currency: "usd",
        status: QuoteStatus.Sent,
        paymentMethodIds: [],
        lineItems: [{ source: { type: "experience", id: "tour", name: "Tour" }, quantity: "1.5", price: "333", taxIds: [] }],
      } as any,
      ctx,
    );
    expect((await services.quotes.findById(quote.id, ctx)).document.subtotal).toBe(499n);

    policy = RECOMMENDED_MONEY_POLICY;
    await services.quotes.update(quote.id, { notes: "bump" } as any, ctx);
    expect((await services.quotes.findById(quote.id, ctx)).document.subtotal).toBe(499n);

    await services.quotes.update(
      quote.id,
      { lineItems: [{ source: { type: "experience", id: "tour", name: "Tour" }, quantity: "1.5", price: "333", taxIds: [] }] } as any,
      ctx,
    );
    const doc = (await services.quotes.findById(quote.id, ctx)).document;
    expect(doc.subtotal).toBe(500n);
    expect(doc.moneyPolicy).toBeNull();
  });
});
