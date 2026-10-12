import { beforeEach, describe, expect, test } from "vitest";
import { inMemoryAdapter } from "../../src/adapters/memory";
import { buildServices, type Services } from "../../src/services";
import { buildMoneySettings } from "../../src/lib/money/settings";
import { LEGACY_MONEY_POLICY, RECOMMENDED_MONEY_POLICY } from "../../src/lib/money";
import { DocumentType, InvoiceStatus, TaxType } from "../../src/types";
import type { MoneyPolicy } from "../../src/types";
import type { AuthContext } from "../../src/auth/types";
import type { ExchangeRateProvider } from "../../src/config";

let rates: Record<string, string | null>;
const ctx: AuthContext = { userId: "u", organizationId: "org", role: null };

const ISSUE_DATE = "2026-09-25";
const dateKey = (date: Date) => date.toISOString().slice(0, 10);
const ratesProvider: ExchangeRateProvider = {
  baseCurrency: () => "dop",
  resolve: async ({ date }) => rates[dateKey(date)] ?? null,
};
const fullPayment = { amount: "118000", currency: "usd", provider: "manual" };

async function seed(services: Services) {
  const client = await services.clients.create({ name: "Hotel" }, ctx);
  const tax = await services.taxes.create({ name: "ITBIS", type: TaxType.Percentage, rate: "0.18" }, ctx);
  const body = () => ({
    clientId: client.id,
    issueDate: ISSUE_DATE,
    currency: "usd",
    paymentMethodIds: [],
    lineItems: [{ source: { type: "experience", id: "tour", name: "Tour" }, quantity: "1", price: "100000", taxIds: [tax.id] }],
  });
  return { client, tax, body };
}

beforeEach(() => {
  rates = { [ISSUE_DATE]: "59.3470" };
});

describe("a payment needs an issued invoice and never issues one", () => {
  test("a payment on a USD draft is refused, freezes nothing and records nothing", async () => {
    const repos = inMemoryAdapter();
    const money = buildMoneySettings({ moneyPolicy: () => RECOMMENDED_MONEY_POLICY, exchangeRates: ratesProvider });
    const services = buildServices(repos, undefined, money);
    const { body } = await seed(services);
    const draft = await services.invoices.create(body(), ctx);
    expect((await services.invoices.findById(draft.id, ctx)).document.total).toBe(118000n);

    await expect(services.payments.recordManualPayment(draft.id, fullPayment, ctx)).rejects.toThrow(
      /PAYMENT_INVOICE_NOT_ISSUED/,
    );

    const invoice = await services.invoices.findById(draft.id, ctx);
    expect(invoice.status).toBe(InvoiceStatus.Draft);
    expect(invoice.document.documentNumber).toBeNull();
    expect(invoice.document.exchangeRate).toBeNull();
    expect(invoice.document.moneyPolicy).toBeNull();
    expect((await services.payments.listForInvoice(draft.id, ctx)).data).toHaveLength(0);
  });

  test("with no rate the invoice cannot issue, so the payment is still refused", async () => {
    rates = {};
    const repos = inMemoryAdapter();
    const money = buildMoneySettings({ moneyPolicy: () => RECOMMENDED_MONEY_POLICY, exchangeRates: ratesProvider });
    const services = buildServices(repos, undefined, money);
    const { body } = await seed(services);
    const draft = await services.invoices.create(body(), ctx);

    await expect(services.invoices.issue(draft.id, ctx)).rejects.toThrow(/EXCHANGE_RATE_REQUIRED/);
    await expect(services.payments.recordManualPayment(draft.id, fullPayment, ctx)).rejects.toThrow(
      /PAYMENT_INVOICE_NOT_ISSUED/,
    );

    expect((await services.invoices.findById(draft.id, ctx)).status).toBe(InvoiceStatus.Draft);
    expect((await services.payments.listForInvoice(draft.id, ctx)).data).toHaveLength(0);
  });
});

describe("a payment leaves the money frozen at issue as it is", () => {
  test("a full payment after the provider rate changed keeps the issued rate, policy and base amounts", async () => {
    const repos = inMemoryAdapter();
    const money = buildMoneySettings({ moneyPolicy: () => RECOMMENDED_MONEY_POLICY, exchangeRates: ratesProvider });
    const services = buildServices(repos, undefined, money);
    const { body } = await seed(services);
    const draft = await services.invoices.create(body(), ctx);
    await services.invoices.issue(draft.id, ctx);

    rates[ISSUE_DATE] = "70";
    await services.payments.recordManualPayment(draft.id, fullPayment, ctx);

    const invoice = await services.invoices.findById(draft.id, ctx);
    expect(invoice.status).toBe(InvoiceStatus.Paid);
    expect(invoice.paidDate).not.toBeNull();
    expect(invoice.document.exchangeRate).toBe("59.347");
    expect(invoice.document.moneyPolicy).toEqual(RECOMMENDED_MONEY_POLICY);
    expect(invoice.document.baseSubtotal).toBe(5_934_700n);
    expect(invoice.document.baseTax).toBe(1_068_246n);
    expect(invoice.document.baseTotal).toBe(7_002_946n);
  });

  test("without a provider, the issued invoice is paid and carries the policy and no rate", async () => {
    const repos = inMemoryAdapter();
    const money = buildMoneySettings({ moneyPolicy: () => RECOMMENDED_MONEY_POLICY });
    const services = buildServices(repos, undefined, money);
    const { body } = await seed(services);
    const draft = await services.invoices.create(body(), ctx);
    await services.invoices.issue(draft.id, ctx);

    await services.payments.recordManualPayment(draft.id, fullPayment, ctx);

    const invoice = await services.invoices.findById(draft.id, ctx);
    expect(invoice.status).toBe(InvoiceStatus.Paid);
    expect(invoice.document.exchangeRate).toBeNull();
    expect(invoice.document.moneyPolicy).toEqual(RECOMMENDED_MONEY_POLICY);
  });
});

describe("a plan resolved before the transaction races an issue that lands first", () => {
  test("update: an edit planned on a draft is refused once a concurrent issue froze the invoice", async () => {
    const repos = inMemoryAdapter();
    let invoiceId = "";
    let concurrentIssueDone = false;
    let services!: Services;
    const money = buildMoneySettings({
      moneyPolicy: async () => {
        if (invoiceId !== "" && !concurrentIssueDone) {
          concurrentIssueDone = true;
          await services.invoices.issue(invoiceId, ctx);
        }
        return RECOMMENDED_MONEY_POLICY;
      },
      exchangeRates: ratesProvider,
    });
    services = buildServices(repos, undefined, money);
    const { tax, body } = await seed(services);
    const draft = await services.invoices.create(body(), ctx);
    invoiceId = draft.id;

    await expect(
      services.invoices.update(
        draft.id,
        {
          lineItems: [{ source: { type: "experience", id: "tour", name: "Tour" }, quantity: "2", price: "100000", taxIds: [tax.id] }],
        },
        ctx,
      ),
    ).rejects.toThrow(/INVOICE_STATUS_TRANSITION_INVALID/);

    const invoice = await services.invoices.findById(draft.id, ctx);
    expect(invoice.status).toBe(InvoiceStatus.Issued);
    expect(invoice.document.exchangeRate).toBe("59.347");
    expect(invoice.document.lineItems.map((lineItem) => lineItem.quantity)).toEqual(["1"]);
    expect(invoice.document.total).toBe(118000n);
    expect(invoice.document.baseTotal).toBe(7_002_946n);
  });

  test("issue: an invoice issued elsewhere while this issue was planning keeps its first rate and takes one number", async () => {
    const repos = inMemoryAdapter();
    let invoiceId = "";
    let concurrentIssueDone = false;
    let services!: Services;
    const issuedInvoiceIds: string[] = [];
    const money = buildMoneySettings({
      moneyPolicy: () => RECOMMENDED_MONEY_POLICY,
      exchangeRates: {
        baseCurrency: () => "dop",
        resolve: async ({ date }) => {
          const key = dateKey(date);
          if (invoiceId !== "" && !concurrentIssueDone) {
            concurrentIssueDone = true;
            rates[key] = "70";
            await services.invoices.issue(invoiceId, ctx);
            rates[key] = "59.3470";
          }
          return rates[key] ?? null;
        },
      },
    });
    services = buildServices(repos, { onInvoiceIssued: ({ invoiceId: issuedId }) => void issuedInvoiceIds.push(issuedId) }, money);
    const { body } = await seed(services);
    const draft = await services.invoices.create(body(), ctx);
    invoiceId = draft.id;

    const invoice = await services.invoices.issue(draft.id, ctx);

    expect(invoice.status).toBe(InvoiceStatus.Issued);
    expect(invoice.document.exchangeRate).toBe("70");
    expect(invoice.document.documentNumber).toBe(1);
    expect(issuedInvoiceIds).toEqual([draft.id]);
    const series = await repos.documentSequences.find({
      organizationId: ctx.organizationId,
      documentType: DocumentType.Invoice,
      prefix: null,
    });
    expect(series?.nextNumber).toBe(2);
  });
});

describe("the amount check and the status decision use the total frozen at issue", () => {
  async function setup(initialPolicy: MoneyPolicy) {
    const repos = inMemoryAdapter();
    const state = { policy: initialPolicy };
    const services = buildServices(repos, undefined, buildMoneySettings({ moneyPolicy: () => state.policy }));
    const { client } = await seed(services);
    const draft = await services.invoices.create(
      {
        clientId: client.id,
        issueDate: ISSUE_DATE,
        currency: "usd",
        paymentMethodIds: [],
        lineItems: [{ source: { type: "experience", id: "tour", name: "Tour" }, quantity: "1.5", price: "333", taxIds: [] }],
      },
      ctx,
    );
    return { services, state, draft };
  }
  const pay = (services: Services, invoiceId: string, amount: string) =>
    services.payments.recordManualPayment(invoiceId, { amount, currency: "usd", provider: "manual" }, ctx);

  test("a policy switch before issue raises the issued total, so the draft total is a partial payment", async () => {
    const { services, state, draft } = await setup(LEGACY_MONEY_POLICY);
    expect((await services.invoices.findById(draft.id, ctx)).document.total).toBe(499n);

    state.policy = RECOMMENDED_MONEY_POLICY;
    await services.invoices.issue(draft.id, ctx);
    await pay(services, draft.id, "499");

    const invoice = await services.invoices.findById(draft.id, ctx);
    expect(invoice.document.total).toBe(500n);
    expect(invoice.document.moneyPolicy).toEqual(RECOMMENDED_MONEY_POLICY);
    expect(invoice.status).toBe(InvoiceStatus.PartiallyPaid);
  });

  test("a policy switch before issue lowers the issued total, so the draft total overpays and writes nothing", async () => {
    const { services, state, draft } = await setup(RECOMMENDED_MONEY_POLICY);
    expect((await services.invoices.findById(draft.id, ctx)).document.total).toBe(500n);

    state.policy = LEGACY_MONEY_POLICY;
    await services.invoices.issue(draft.id, ctx);
    await expect(pay(services, draft.id, "500")).rejects.toThrow(/PAYMENT_AMOUNT_EXCEEDS_INVOICE_TOTAL/);

    const invoice = await services.invoices.findById(draft.id, ctx);
    expect(invoice.status).toBe(InvoiceStatus.Issued);
    expect(invoice.document.total).toBe(499n);
    expect((await services.payments.listForInvoice(draft.id, ctx)).data).toHaveLength(0);
  });

  test("a policy switch after issue changes nothing: the issued total is paid in full", async () => {
    const { services, state, draft } = await setup(LEGACY_MONEY_POLICY);
    await services.invoices.issue(draft.id, ctx);

    state.policy = RECOMMENDED_MONEY_POLICY;
    await pay(services, draft.id, "499");

    const invoice = await services.invoices.findById(draft.id, ctx);
    expect(invoice.document.total).toBe(499n);
    expect(invoice.document.moneyPolicy).toEqual(LEGACY_MONEY_POLICY);
    expect(invoice.status).toBe(InvoiceStatus.Paid);
  });
});
