import { beforeEach, describe, expect, test } from "vitest";
import { inMemoryAdapter } from "../../src/adapters/memory";
import { buildServices, type Services } from "../../src/services";
import { buildMoneySettings } from "../../src/lib/money/settings";
import { LEGACY_MONEY_POLICY, RECOMMENDED_MONEY_POLICY } from "../../src/lib/money";
import { ExchangeRateSource, InvoiceStatus } from "../../src/types";
import type { MoneyPolicy } from "../../src/types";
import type { AuthContext } from "../../src/auth/types";

let rates: Record<string, string | null>;
const ctx: AuthContext = { userId: "u", organizationId: "org", role: null };

async function seed(services: Services) {
  const client = await services.clients.create({ name: "Hotel" }, ctx);
  const tax = await services.taxes.create({ name: "ITBIS", type: "PERCENTAGE" as any, rate: "0.18" }, ctx);
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
  return { client, tax, body };
}

beforeEach(() => {
  rates = { "2026-09-25": "59.3470" };
});

describe("a payment that issues a draft invoice", () => {
  test("a full manual payment on a USD draft freezes the rate, the policy and the base amounts", async () => {
    const repos = inMemoryAdapter();
    const money = buildMoneySettings({
      moneyPolicy: () => RECOMMENDED_MONEY_POLICY,
      exchangeRates: {
        baseCurrency: () => "dop",
        resolve: async ({ date }) => rates[date.toISOString().slice(0, 10)] ?? null,
      },
    });
    const services = buildServices(repos, undefined, money);
    const { body } = await seed(services);
    const draft = await services.invoices.create(body(), ctx);
    // subtotal 100000, tax 18000 (18% at document level), total 118000
    const draftDoc = (await services.invoices.findById(draft.id, ctx)).document;
    expect(draftDoc.total).toBe(118000n);
    expect(draftDoc.moneyPolicy).toBeNull();

    await services.payments.recordManualPayment(
      draft.id,
      { amount: "118000", currency: "usd", provider: "manual" } as any,
      ctx,
    );

    const invoice = await services.invoices.findById(draft.id, ctx);
    expect(invoice.status).toBe(InvoiceStatus.Paid);
    expect(invoice.document.exchangeRate).toBe("59.347");
    expect(invoice.document.moneyPolicy).toEqual(RECOMMENDED_MONEY_POLICY);
    expect(invoice.document.baseSubtotal).toBe(5_934_700n);
    expect(invoice.document.baseTax).toBe(1_068_246n);
    expect(invoice.document.baseTotal).toBe(7_002_946n);
  });

  test("with no rate available, the payment is rejected and nothing is recorded", async () => {
    rates = {};
    const repos = inMemoryAdapter();
    const money = buildMoneySettings({
      moneyPolicy: () => RECOMMENDED_MONEY_POLICY,
      exchangeRates: {
        baseCurrency: () => "dop",
        resolve: async ({ date }) => rates[date.toISOString().slice(0, 10)] ?? null,
      },
    });
    const services = buildServices(repos, undefined, money);
    const { body } = await seed(services);
    const draft = await services.invoices.create(body(), ctx);

    await expect(
      services.payments.recordManualPayment(
        draft.id,
        { amount: "118000", currency: "usd", provider: "manual" } as any,
        ctx,
      ),
    ).rejects.toThrow(/EXCHANGE_RATE_REQUIRED/);

    const invoice = await services.invoices.findById(draft.id, ctx);
    expect(invoice.status).toBe(InvoiceStatus.Draft);
    expect(invoice.document.exchangeRate).toBeNull();
    const payments = await services.payments.listForInvoice(draft.id, ctx);
    expect(payments.data ?? payments).toHaveLength(0);
  });

  test("without a provider, the payment still works and records the policy (backward compatible)", async () => {
    const repos = inMemoryAdapter();
    const money = buildMoneySettings({ moneyPolicy: () => RECOMMENDED_MONEY_POLICY });
    const services = buildServices(repos, undefined, money);
    const { body } = await seed(services);
    const draft = await services.invoices.create(body(), ctx);

    await services.payments.recordManualPayment(
      draft.id,
      { amount: "118000", currency: "usd", provider: "manual" } as any,
      ctx,
    );

    const invoice = await services.invoices.findById(draft.id, ctx);
    expect(invoice.status).toBe(InvoiceStatus.Paid);
    expect(invoice.document.exchangeRate).toBeNull();
    expect(invoice.document.moneyPolicy).toEqual(RECOMMENDED_MONEY_POLICY);
  });
});

describe("a plan resolved before the transaction races an issue that lands first", () => {
  test("update: editing lines on what looks like a draft doesn't null out a rate frozen by a concurrent issue", async () => {
    rates = { "2026-09-25": "59.3470" };
    const repos = inMemoryAdapter();
    let invoiceId = "";
    let sideEffectDone = false;
    let services!: Services;
    const money = buildMoneySettings({
      moneyPolicy: async () => {
        // Fires while `update()` below is planning its (line-item-only) write, which
        // still believes the document is an unissued draft. A concurrent process issues
        // the SAME invoice first, before this pre-transaction plan is applied.
        if (invoiceId !== "" && !sideEffectDone) {
          sideEffectDone = true;
          await services.invoices.update(invoiceId, { status: InvoiceStatus.Sent } as any, ctx);
        }
        return RECOMMENDED_MONEY_POLICY;
      },
      exchangeRates: {
        baseCurrency: () => "dop",
        resolve: async ({ date }) => rates[date.toISOString().slice(0, 10)] ?? null,
      },
    });
    services = buildServices(repos, undefined, money);
    const { tax, body } = await seed(services);
    const draft = await services.invoices.create(body(), ctx);
    invoiceId = draft.id;

    await services.invoices.update(
      draft.id,
      {
        lineItems: [{ source: { type: "experience", id: "tour", name: "Tour" }, quantity: "2", price: "100000", taxIds: [tax.id] }],
      } as any,
      ctx,
    );

    const invoice = await services.invoices.findById(draft.id, ctx);
    expect(invoice.status).toBe(InvoiceStatus.Sent);
    expect(invoice.document.exchangeRate).toBe("59.347");
    expect(invoice.document.baseTotal).not.toBeNull();
    expect(invoice.document.baseSubtotal).not.toBeNull();
  });

  test("bulk: an invoice issued elsewhere before the batch transaction keeps its own frozen rate", async () => {
    rates = { "2026-09-25": "59.3470" };
    const repos = inMemoryAdapter();
    let invoiceId = "";
    let sideEffectDone = false;
    let services!: Services;
    const money = buildMoneySettings({
      moneyPolicy: () => RECOMMENDED_MONEY_POLICY,
      exchangeRates: {
        baseCurrency: () => "dop",
        resolve: async ({ date }) => {
          const key = date.toISOString().slice(0, 10);
          if (invoiceId !== "" && !sideEffectDone) {
            sideEffectDone = true;
            rates[key] = "70";
            // A concurrent process issues the SAME invoice directly (at rate 70) while
            // bulkUpdateStatus's pre-transaction planning is still resolving its own rate.
            await services.invoices.update(invoiceId, { status: InvoiceStatus.Sent } as any, ctx);
            rates[key] = "59.3470";
          }
          return rates[key] ?? null;
        },
      },
    });
    services = buildServices(repos, undefined, money);
    const { body } = await seed(services);
    const draft = await services.invoices.create(body(), ctx);
    invoiceId = draft.id;

    await services.invoices.bulkUpdateStatus([draft.id], InvoiceStatus.Sent, ctx);

    const invoice = await services.invoices.findById(draft.id, ctx);
    expect(invoice.status).toBe(InvoiceStatus.Sent);
    expect(invoice.document.exchangeRate).toBe("70");
  });
});

describe("the amount check and status decision use the recomputed total, not the pre-recompute one", () => {
  function draftBody(clientId: string) {
    return {
      clientId,
      issueDate: "2026-09-25",
      currency: "usd",
      status: InvoiceStatus.Draft,
      paymentMethodIds: [],
      // qty 1.5 x price 333, no tax: LEGACY (truncate) totals 499, RECOMMENDED (half-up) totals 500.
      lineItems: [{ source: { type: "experience", id: "tour", name: "Tour" }, quantity: "1.5", price: "333", taxIds: [] }],
    } as any;
  }

  test("a policy switch that raises the recomputed total turns a formerly-full payment into a partial one", async () => {
    const repos = inMemoryAdapter();
    let policy: MoneyPolicy = LEGACY_MONEY_POLICY;
    const money = buildMoneySettings({ moneyPolicy: () => policy });
    const services = buildServices(repos, undefined, money);
    const { client } = await seed(services);
    const draft = await services.invoices.create(draftBody(client.id), ctx);
    expect((await services.invoices.findById(draft.id, ctx)).document.total).toBe(499n);

    // The org switches its money policy before this (still-draft) invoice is ever issued.
    policy = RECOMMENDED_MONEY_POLICY;
    await services.payments.recordManualPayment(
      draft.id,
      { amount: "499", currency: "usd", provider: "manual" } as any,
      ctx,
    );

    const invoice = await services.invoices.findById(draft.id, ctx);
    expect(invoice.document.total).toBe(500n);
    // 499 paid against a recomputed total of 500 is a partial payment, not a full one.
    expect(invoice.status).toBe(InvoiceStatus.PartiallyPaid);
  });

  test("a policy switch that lowers the recomputed total rejects a now-overpaying amount and writes nothing", async () => {
    const repos = inMemoryAdapter();
    let policy: MoneyPolicy = RECOMMENDED_MONEY_POLICY;
    const money = buildMoneySettings({ moneyPolicy: () => policy });
    const services = buildServices(repos, undefined, money);
    const { client } = await seed(services);
    const draft = await services.invoices.create(draftBody(client.id), ctx);
    expect((await services.invoices.findById(draft.id, ctx)).document.total).toBe(500n);

    policy = LEGACY_MONEY_POLICY;
    await expect(
      services.payments.recordManualPayment(
        draft.id,
        { amount: "500", currency: "usd", provider: "manual" } as any,
        ctx,
      ),
    ).rejects.toThrow(/PAYMENT_AMOUNT_EXCEEDS_INVOICE_TOTAL/);

    const invoice = await services.invoices.findById(draft.id, ctx);
    // Nothing written: still a draft, total unchanged (the recompute inside the
    // failed transaction was rolled back), no payment recorded.
    expect(invoice.status).toBe(InvoiceStatus.Draft);
    expect(invoice.document.total).toBe(500n);
    expect(invoice.document.moneyPolicy).toBeNull();
    const payments = await services.payments.listForInvoice(draft.id, ctx);
    expect(payments.data ?? payments).toHaveLength(0);
  });
});

describe("a zero-amount payment on a zero-total draft is still an issue (residual fix)", () => {
  test("freezes the policy and rate even though the payment amount is 0", async () => {
    const repos = inMemoryAdapter();
    const money = buildMoneySettings({
      moneyPolicy: () => RECOMMENDED_MONEY_POLICY,
      exchangeRates: {
        baseCurrency: () => "dop",
        resolve: async ({ date }) => rates[date.toISOString().slice(0, 10)] ?? null,
      },
    });
    const services = buildServices(repos, undefined, money);
    const { client } = await seed(services);
    const draft = await services.invoices.create(
      {
        clientId: client.id,
        issueDate: "2026-09-25",
        currency: "usd",
        status: InvoiceStatus.Draft,
        paymentMethodIds: [],
        lineItems: [{ source: { type: "experience", id: "tour", name: "Tour" }, quantity: "1", price: "0", taxIds: [] }],
      } as any,
      ctx,
    );
    expect((await services.invoices.findById(draft.id, ctx)).document.total).toBe(0n);

    await services.payments.recordManualPayment(
      draft.id,
      { amount: "0", currency: "usd", provider: "manual" } as any,
      ctx,
    );

    const invoice = await services.invoices.findById(draft.id, ctx);
    expect(invoice.status).toBe(InvoiceStatus.Paid);
    expect(invoice.document.moneyPolicy).toEqual(RECOMMENDED_MONEY_POLICY);
    expect(invoice.document.exchangeRate).toBe("59.347");
    expect(invoice.document.baseTotal).toBe(0n);
  });
});

describe("a payment that stays a draft (0 against a positive recomputed total) writes nothing", () => {
  test("a zero payment on a draft whose recompute raises the total above 0 leaves it an unfrozen draft", async () => {
    rates = { "2026-09-25": "59.3470" };
    const repos = inMemoryAdapter();
    let policy: MoneyPolicy = LEGACY_MONEY_POLICY;
    const money = buildMoneySettings({
      moneyPolicy: () => policy,
      exchangeRates: {
        baseCurrency: () => "dop",
        resolve: async ({ date }) => rates[date.toISOString().slice(0, 10)] ?? null,
      },
    });
    const services = buildServices(repos, undefined, money);
    const { client } = await seed(services);
    // qty 0.5 x price 1, no tax: LEGACY (truncate) totals 0, RECOMMENDED (half-up) totals 1.
    const draft = await services.invoices.create(
      {
        clientId: client.id,
        issueDate: "2026-09-25",
        currency: "usd",
        status: InvoiceStatus.Draft,
        paymentMethodIds: [],
        lineItems: [{ source: { type: "experience", id: "tour", name: "Tour" }, quantity: "0.5", price: "1", taxIds: [] }],
      } as any,
      ctx,
    );
    expect((await services.invoices.findById(draft.id, ctx)).document.total).toBe(0n);

    // The org switches its policy before paying; the stored total (0) is stale —
    // the recomputed total (1) is what the $0 payment must be checked against.
    policy = RECOMMENDED_MONEY_POLICY;
    await services.payments.recordManualPayment(
      draft.id,
      { amount: "0", currency: "usd", provider: "manual" } as any,
      ctx,
    );

    const invoice = await services.invoices.findById(draft.id, ctx);
    expect(invoice.status).toBe(InvoiceStatus.Draft);
    expect(invoice.document.moneyPolicy).toBeNull();
    expect(invoice.document.exchangeRate).toBeNull();
    // Nothing was written to the document: the stored (stale) total is untouched.
    expect(invoice.document.total).toBe(0n);

    // Not frozen: a manual rate on what is still a genuine draft must be accepted,
    // not rejected with EXCHANGE_RATE_FROZEN.
    await services.invoices.update(draft.id, { exchangeRate: "60" } as any, ctx);
    const afterUpdate = await services.invoices.findById(draft.id, ctx);
    expect(afterUpdate.document.exchangeRateSource).toBe(ExchangeRateSource.Manual);
    expect(afterUpdate.document.exchangeRate).toBe("60");
    expect(afterUpdate.document.moneyPolicy).toBeNull();
  });

  test("a zero-rate provider still rejects the payment on a draft (accepted trade-off)", async () => {
    rates = {};
    const repos = inMemoryAdapter();
    const money = buildMoneySettings({
      moneyPolicy: () => RECOMMENDED_MONEY_POLICY,
      exchangeRates: {
        baseCurrency: () => "dop",
        resolve: async ({ date }) => rates[date.toISOString().slice(0, 10)] ?? null,
      },
    });
    const services = buildServices(repos, undefined, money);
    const { body } = await seed(services);
    const draft = await services.invoices.create(body(), ctx);

    // Even a $0 payment now plans (always plans for a draft), so a missing rate
    // rejects it — accepted per the round-3 decision.
    await expect(
      services.payments.recordManualPayment(
        draft.id,
        { amount: "0", currency: "usd", provider: "manual" } as any,
        ctx,
      ),
    ).rejects.toThrow(/EXCHANGE_RATE_REQUIRED/);

    const invoice = await services.invoices.findById(draft.id, ctx);
    expect(invoice.status).toBe(InvoiceStatus.Draft);
    const payments = await services.payments.listForInvoice(draft.id, ctx);
    expect(payments.data ?? payments).toHaveLength(0);
  });
});
