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
  const invoice = (status: InvoiceStatus) =>
    services.invoices.create(
      {
        clientId: client.id,
        issueDate: "2026-09-25",
        currency: "usd",
        status,
        paymentMethodIds: [],
        lineItems: [{ source: { type: "experience", id: "tour", name: "Tour" }, quantity: "1", price: "100000", taxIds: [] }],
      } as any,
      ctx,
    );
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
  return { services, invoice, bill };
}

const pay = (amount: string) => ({ amount, currency: "usd", provider: "manual" }) as any;

describe("deleting a payment on a draft leaves it a draft", () => {
  test("invoice: a $0 payment on a draft, deleted, keeps the draft unfrozen", async () => {
    const { services, invoice } = await setup();
    const draft = await invoice(InvoiceStatus.Draft);
    const payment = await services.payments.recordManualPayment(draft.id, pay("0"), ctx);
    expect((await services.invoices.findById(draft.id, ctx)).status).toBe(InvoiceStatus.Draft);

    await services.payments.delete(payment.id, ctx);

    const after = await services.invoices.findById(draft.id, ctx);
    expect(after.status).toBe(InvoiceStatus.Draft);
    expect(after.document.moneyPolicy).toBeNull();
  });

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

describe("a payment that issues a draft fires the issue hook before the payment hook", () => {
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

  test("invoice: full and partial payments on drafts", async () => {
    const { calls, hooks } = recorder();
    const { services, invoice } = await setup(hooks);
    const full = await invoice(InvoiceStatus.Draft);
    const partial = await invoice(InvoiceStatus.Draft);

    const fullPayment = await services.payments.recordManualPayment(full.id, pay("100000"), ctx);
    const partialPayment = await services.payments.recordManualPayment(partial.id, pay("100"), ctx);

    expect(calls).toEqual([
      `issued:${full.id}`,
      `payment:${fullPayment.id}`,
      `issued:${partial.id}`,
      `payment:${partialPayment.id}`,
    ]);
  });

  test("invoice: no issue hook for a payment on an already-issued invoice or one that leaves a draft", async () => {
    const { calls, hooks } = recorder();
    const { services, invoice } = await setup(hooks);
    const sent = await invoice(InvoiceStatus.Sent);
    const draft = await invoice(InvoiceStatus.Draft);
    calls.length = 0;

    const first = await services.payments.recordManualPayment(sent.id, pay("100"), ctx);
    const second = await services.payments.recordManualPayment(sent.id, pay("100"), ctx);
    const zero = await services.payments.recordManualPayment(draft.id, pay("0"), ctx);

    expect(calls).toEqual([`payment:${first.id}`, `payment:${second.id}`, `payment:${zero.id}`]);
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

  test("a throwing issue hook never fails the payment and the payment hook still fires", async () => {
    const calls: string[] = [];
    const { services, invoice } = await setup({
      onInvoiceIssued: () => {
        throw new Error("ledger down");
      },
      onPaymentSucceeded: ({ paymentId }) => void calls.push(paymentId),
    });
    const draft = await invoice(InvoiceStatus.Draft);

    const payment = await services.payments.recordManualPayment(draft.id, pay("100000"), ctx);

    expect(calls).toEqual([payment.id]);
    expect((await services.invoices.findById(draft.id, ctx)).status).toBe(InvoiceStatus.Paid);
  });
});
