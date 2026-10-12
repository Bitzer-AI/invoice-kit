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
    const invoice = await services.invoices.create(body(), ctx);
    const issued = await services.invoices.issue(invoice.id, ctx);
    const doc = issued.document;
    expect(issued.status).toBe(InvoiceStatus.Issued);
    expect(doc.exchangeRate).toBe("59.347");
    expect(doc.exchangeRateSource).toBe(ExchangeRateSource.Provider);
    expect(doc.baseCurrency).toBe("dop");
    expect(doc.moneyPolicy).toEqual(RECOMMENDED_MONEY_POLICY);
    expect([doc.baseSubtotal, doc.baseTax, doc.baseTotal]).toEqual([5_934_700n, 1_068_246n, 7_002_946n]);
    expect(doc.lineItems[0]!.baseSubtotal).toBe(5_934_700n);
  });

  test("issuing without a rate is 422 and the invoice stays an unnumbered draft", async () => {
    rates = {};
    const { services, body } = await setup();
    const draft = await services.invoices.create(body(), ctx);
    await expect(services.invoices.issue(draft.id, ctx)).rejects.toThrow(/EXCHANGE_RATE_REQUIRED/);
    const full = await services.invoices.findById(draft.id, ctx);
    expect(full.status).toBe(InvoiceStatus.Draft);
    expect(full.document.documentNumber).toBeNull();
    expect(full.document.moneyPolicy).toBeNull();
  });

  test("a partner's own rate on the draft wins at issue", async () => {
    const { services, body } = await setup();
    const draft = await services.invoices.create(body({ exchangeRate: "60.5" }), ctx);
    const stored = (await services.invoices.findById(draft.id, ctx)).document;
    expect(stored.exchangeRateSource).toBe(ExchangeRateSource.Manual);
    expect(stored.baseTotal).toBeNull();
    const doc = (await services.invoices.issue(draft.id, ctx)).document;
    expect(doc.exchangeRate).toBe("60.5");
    expect(doc.exchangeRateSource).toBe(ExchangeRateSource.Manual);
    expect(doc.baseSubtotal).toBe(6_050_000n);
    expect(providerCalls).toBe(0);
  });

  test("clearing the draft's rate falls back to the provider", async () => {
    const { services, body } = await setup();
    const draft = await services.invoices.create(body({ exchangeRate: "60.5" }), ctx);
    await services.invoices.update(draft.id, { exchangeRate: null }, ctx);
    const doc = (await services.invoices.issue(draft.id, ctx)).document;
    expect(doc.exchangeRate).toBe("59.347");
    expect(doc.exchangeRateSource).toBe(ExchangeRateSource.Provider);
  });

  test("base-currency invoices get the identity rate; manual rates are not applicable", async () => {
    const { services, body } = await setup();
    const dop = await services.invoices.create(body({ currency: "dop" }), ctx);
    const doc = (await services.invoices.issue(dop.id, ctx)).document;
    expect(doc.exchangeRate).toBe("1");
    expect(doc.exchangeRateSource).toBe(ExchangeRateSource.Identity);
    expect(doc.baseTotal).toBe(doc.total);
    await expect(services.invoices.create(body({ currency: "dop", exchangeRate: "2" }), ctx)).rejects.toThrow(/EXCHANGE_RATE_NOT_APPLICABLE/);
  });

  test("after issue the invoice takes no edit: its rate and its lines stay", async () => {
    const { services, body } = await setup();
    const invoice = await services.invoices.create(body(), ctx);
    await services.invoices.issue(invoice.id, ctx);
    rates["2026-09-25"] = "70";
    await expect(services.invoices.update(invoice.id, { exchangeRate: "61" }, ctx)).rejects.toThrow(
      /INVOICE_STATUS_TRANSITION_INVALID/,
    );
    await expect(
      services.invoices.update(
        invoice.id,
        { lineItems: [{ source: { type: "experience", id: "tour", name: "Tour" }, quantity: "2", price: "100000", taxIds: [] }] },
        ctx,
      ),
    ).rejects.toThrow(/INVOICE_STATUS_TRANSITION_INVALID/);
    const doc = (await services.invoices.findById(invoice.id, ctx)).document;
    expect(doc.exchangeRate).toBe("59.347");
    expect(doc.baseSubtotal).toBe(5_934_700n);
    expect(doc.lineItems).toHaveLength(1);
  });

  test("issuing an issued invoice again keeps its frozen rate and its number", async () => {
    const { services, body } = await setup();
    const invoice = await services.invoices.create(body(), ctx);
    const first = await services.invoices.issue(invoice.id, ctx);
    const callsAfterFirstIssue = providerCalls;
    rates["2026-09-25"] = "70";
    const second = await services.invoices.issue(invoice.id, ctx);
    expect(second.document.exchangeRate).toBe("59.347");
    expect(second.document.documentNumber).toBe(first.document.documentNumber);
    expect(providerCalls).toBe(callsAfterFirstIssue);
  });

  test("a provider rate with trailing zeros is stored canonical; one with 9 decimals fails and keeps the draft", async () => {
    rates["2026-09-25"] = "59.34700000";
    const { services, body } = await setup();
    const ok = await services.invoices.create(body(), ctx);
    expect((await services.invoices.issue(ok.id, ctx)).document.exchangeRate).toBe("59.347");
    rates["2026-09-25"] = "59.123456789";
    const draft = await services.invoices.create(body(), ctx);
    await expect(services.invoices.issue(draft.id, ctx)).rejects.toThrow(RangeError);
    expect((await services.invoices.findById(draft.id, ctx)).status).toBe(InvoiceStatus.Draft);
  });

  test("an issue that fails for a missing rate takes no number from the series", async () => {
    const { services, body } = await setup();
    const rated = await services.invoices.create(body(), ctx);
    const unrated = await services.invoices.create(body({ issueDate: "2026-09-26" }), ctx);
    const alsoRated = await services.invoices.create(body(), ctx);

    expect((await services.invoices.issue(rated.id, ctx)).document.documentNumber).toBe(1);
    await expect(services.invoices.issue(unrated.id, ctx)).rejects.toThrow(/EXCHANGE_RATE_REQUIRED/);
    expect((await services.invoices.issue(alsoRated.id, ctx)).document.documentNumber).toBe(2);

    const stillDraft = await services.invoices.findById(unrated.id, ctx);
    expect(stillDraft.status).toBe(InvoiceStatus.Draft);
    expect(stillDraft.document.documentNumber).toBeNull();
  });

  test("without a provider, issuing works and carries no rate (backward compatible)", async () => {
    const { services, body } = await setup({ provider: false });
    const invoice = await services.invoices.create(body(), ctx);
    const doc = (await services.invoices.issue(invoice.id, ctx)).document;
    expect(doc.exchangeRate).toBeNull();
    expect(doc.moneyPolicy).toEqual(RECOMMENDED_MONEY_POLICY);
    await expect(services.invoices.create(body({ exchangeRate: "59" }), ctx)).rejects.toThrow(/EXCHANGE_RATE_NOT_APPLICABLE/);
  });
});
