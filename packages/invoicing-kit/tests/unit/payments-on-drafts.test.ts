import { describe, expect, test } from "vitest";
import { inMemoryAdapter } from "../../src/adapters/memory";
import { buildServices } from "../../src/services";
import { buildMoneySettings } from "../../src/lib/money/settings";
import { RECOMMENDED_MONEY_POLICY } from "../../src/lib/money";
import { InvoiceStatus, VendorBillStatus } from "../../src/types";
import type { InvoicingKitHooks } from "../../src/config";
import type { AuthContext } from "../../src/auth/types";

const ctx: AuthContext = { userId: "u", organizationId: "org", role: null };

async function setup(hooks?: InvoicingKitHooks) {
  const repos = inMemoryAdapter();
  const services = buildServices(
    repos,
    hooks,
    buildMoneySettings({
      moneyPolicy: () => RECOMMENDED_MONEY_POLICY,
      exchangeRates: { baseCurrency: () => "dop", resolve: async () => "59.347" },
    }),
  );
  const client = await repos.clients.create({ organizationId: "org", name: "Hotel" });
  const vendor = await repos.vendors.create({ organizationId: "org", name: "Fuel Co" });
  const draftInvoice = () =>
    services.invoices.create(
      {
        clientId: client.id,
        issueDate: "2026-09-25",
        currency: "usd",
        paymentMethodIds: [],
        lineItems: [{ source: { type: "experience", id: "tour", name: "Tour" }, quantity: "1", price: "100000", taxIds: [] }],
      },
      ctx,
    );
  const issuedInvoice = async () => services.invoices.issue((await draftInvoice()).id, ctx);
  const bill = (status: VendorBillStatus) =>
    services.vendorBills.create(
      {
        vendorId: vendor.id,
        issueDate: "2026-09-25",
        currency: "usd",
        status,
        lineItems: [{ source: { type: "expense", id: "fuel", name: "Fuel" }, quantity: "1", price: "5000", taxIds: [] }],
      } as any,
      ctx,
    );
  return { services, draftInvoice, issuedInvoice, bill };
}

const pay = (amount: string) => ({ amount, currency: "usd", provider: "manual" }) as any;

describe("an invoice takes a payment only once it is issued", () => {
  test("a payment on a draft invoice is refused and the draft stays unfrozen", async () => {
    const { services, draftInvoice } = await setup();
    const draft = await draftInvoice();

    await expect(services.payments.recordManualPayment(draft.id, pay("100000"), ctx)).rejects.toMatchObject({
      status: 409,
      message: expect.stringContaining("PAYMENT_INVOICE_NOT_ISSUED"),
    });

    const after = await services.invoices.findById(draft.id, ctx);
    expect(after.status).toBe(InvoiceStatus.Draft);
    expect(after.document.moneyPolicy).toBeNull();
    expect((await services.payments.listForInvoice(draft.id, ctx)).data).toHaveLength(0);
  });

  test("deleting the only payment of an issued invoice returns it to issued and keeps it frozen", async () => {
    const { services, issuedInvoice } = await setup();
    const issued = await issuedInvoice();
    const payment = await services.payments.recordManualPayment(issued.id, pay("100"), ctx);
    expect((await services.invoices.findById(issued.id, ctx)).status).toBe(InvoiceStatus.PartiallyPaid);

    await services.payments.delete(payment.id, ctx);

    const after = await services.invoices.findById(issued.id, ctx);
    expect(after.status).toBe(InvoiceStatus.Issued);
    expect(after.paidDate).toBeNull();
    expect(after.document.moneyPolicy).toEqual(RECOMMENDED_MONEY_POLICY);
    expect(after.document.exchangeRate).toBe("59.347");
  });
});

describe("deleting a payment on a draft vendor bill leaves it a draft", () => {
  test("vendor bill: a $0 payment on a draft, deleted, keeps the draft unfrozen", async () => {
    const { services, bill } = await setup();
    const draft = await bill(VendorBillStatus.Draft);
    const payment = await services.vendorBillPayments.recordManualVendorBillPayment(draft.id, pay("0"), ctx);
    expect((await services.vendorBills.findById(draft.id, ctx)).status).toBe(VendorBillStatus.Draft);

    await services.vendorBillPayments.delete(payment.id, ctx);

    const after = await services.vendorBills.findById(draft.id, ctx);
    expect(after.status).toBe(VendorBillStatus.Draft);
    expect(after.document.moneyPolicy).toBeNull();
  });
});

describe("issue hooks and payment hooks", () => {
  function recorder() {
    const calls: string[] = [];
    const hooks: InvoicingKitHooks = {
      onInvoiceIssued: ({ invoiceId }) => void calls.push(`issued:${invoiceId}`),
      onPaymentSucceeded: ({ paymentId }) => void calls.push(`payment:${paymentId}`),
      onVendorBillRecorded: ({ vendorBillId }) => void calls.push(`recorded:${vendorBillId}`),
      onVendorBillPaymentSucceeded: ({ vendorBillPaymentId }) => void calls.push(`payment:${vendorBillPaymentId}`),
    };
    return { calls, hooks };
  }

  test("invoice: the issue hook fires at issue, and a full or a partial payment fires the payment hook only", async () => {
    const { calls, hooks } = recorder();
    const { services, issuedInvoice } = await setup(hooks);
    const full = await issuedInvoice();
    const partial = await issuedInvoice();
    expect(calls).toEqual([`issued:${full.id}`, `issued:${partial.id}`]);
    calls.length = 0;

    const fullPayment = await services.payments.recordManualPayment(full.id, pay("100000"), ctx);
    const partialPayment = await services.payments.recordManualPayment(partial.id, pay("100"), ctx);
    const secondPartialPayment = await services.payments.recordManualPayment(partial.id, pay("100"), ctx);

    expect(calls).toEqual([
      `payment:${fullPayment.id}`,
      `payment:${partialPayment.id}`,
      `payment:${secondPartialPayment.id}`,
    ]);
  });

  test("invoice: a refused payment on a draft fires no hook", async () => {
    const { calls, hooks } = recorder();
    const { services, draftInvoice } = await setup(hooks);
    const draft = await draftInvoice();

    await expect(services.payments.recordManualPayment(draft.id, pay("100000"), ctx)).rejects.toThrow(
      /PAYMENT_INVOICE_NOT_ISSUED/,
    );

    expect(calls).toEqual([]);
  });

  test("vendor bill: a payment on a draft fires recorded, then the payment hook; none on a received bill", async () => {
    const { calls, hooks } = recorder();
    const { services, bill } = await setup(hooks);
    const draft = await bill(VendorBillStatus.Draft);
    const received = await bill(VendorBillStatus.Received);
    calls.length = 0;

    const onDraft = await services.vendorBillPayments.recordManualVendorBillPayment(draft.id, pay("5000"), ctx);
    const onReceived = await services.vendorBillPayments.recordManualVendorBillPayment(received.id, pay("100"), ctx);

    expect(calls).toEqual([`recorded:${draft.id}`, `payment:${onDraft.id}`, `payment:${onReceived.id}`]);
  });

  test("a throwing issue hook never fails the issue, and the payment hook of a later payment still fires", async () => {
    const calls: string[] = [];
    const { services, issuedInvoice } = await setup({
      onInvoiceIssued: () => {
        throw new Error("ledger down");
      },
      onPaymentSucceeded: ({ paymentId }) => void calls.push(paymentId),
    });
    const issued = await issuedInvoice();
    expect(issued.status).toBe(InvoiceStatus.Issued);

    const payment = await services.payments.recordManualPayment(issued.id, pay("100000"), ctx);

    expect(calls).toEqual([payment.id]);
    expect((await services.invoices.findById(issued.id, ctx)).status).toBe(InvoiceStatus.Paid);
  });
});
