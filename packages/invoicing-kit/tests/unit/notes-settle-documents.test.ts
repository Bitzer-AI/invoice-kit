import { describe, expect, test } from "vitest";
import { inMemoryAdapter } from "../../src/adapters/memory";
import { buildServices } from "../../src/services";
import { buildMoneySettings } from "../../src/lib/money/settings";
import { RECOMMENDED_MONEY_POLICY } from "../../src/lib/money";
import { ErrorCode } from "../../src/lib/errors";
import { InvoiceStatus, NoteStatus, NoteType, VendorBillStatus } from "../../src/types";
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
  const vendor = await repos.vendors.create({ organizationId: "org", name: "Fuel Co" });
  const tour = (price: string) => [{ source: { type: "experience", id: "tour", name: "Tour" }, quantity: "1", price, taxIds: [] }];
  const fuel = (price: string) => [{ source: { type: "expense", id: "fuel", name: "Fuel" }, quantity: "1", price, taxIds: [] }];

  const invoice = await services.invoices.create(
    { clientId: client.id, issueDate: "2026-09-25", currency: "usd", status: InvoiceStatus.Sent, paymentMethodIds: [], lineItems: tour("100000") } as any,
    ctx,
  );
  const invoiceDocId = (await services.invoices.findById(invoice.id, ctx)).document.id;
  const bill = await services.vendorBills.create(
    { vendorId: vendor.id, issueDate: "2026-09-25", currency: "usd", status: VendorBillStatus.Received, lineItems: fuel("50000") } as any,
    ctx,
  );
  const billDocId = (await services.vendorBills.findById(bill.id, ctx)).document.id;

  const saleNote = (noteType: NoteType, price: string, status: NoteStatus = NoteStatus.Issued) =>
    services.notes.create(
      { noteType, referencedDocumentId: invoiceDocId, clientId: client.id, issueDate: "2026-09-26", status, lineItems: tour(price) } as any,
      ctx,
    );
  const purchaseNote = (noteType: NoteType, price: string) =>
    services.notes.create(
      { noteType, referencedDocumentId: billDocId, vendorId: vendor.id, issueDate: "2026-09-26", status: NoteStatus.Issued, lineItems: fuel(price) } as any,
      ctx,
    );
  const pay = (amount: string) =>
    services.payments.recordManualPayment(invoice.id, { amount, currency: "usd", provider: "manual" } as any, ctx);
  const payBill = (amount: string) =>
    services.vendorBillPayments.recordManualVendorBillPayment(bill.id, { amount, currency: "usd", provider: "manual" } as any, ctx);
  const invoiceStatus = async () => (await services.invoices.findById(invoice.id, ctx)).status;
  const billStatus = async () => (await services.vendorBills.findById(bill.id, ctx)).status;

  return { services, saleNote, purchaseNote, pay, payBill, invoiceStatus, billStatus };
}

describe("issued notes settle the document they reference", () => {
  test("a payment can't exceed what is left after an issued credit note", async () => {
    const { saleNote, pay, invoiceStatus } = await setup();
    await saleNote(NoteType.Credit, "20000");

    await expect(pay("100000")).rejects.toThrow(ErrorCode.PaymentAmountExceedsInvoiceTotal);
    await pay("80000");

    expect(await invoiceStatus()).toBe(InvoiceStatus.Paid);
  });

  test("a draft credit note settles nothing", async () => {
    const { saleNote, pay, invoiceStatus } = await setup();
    await saleNote(NoteType.Credit, "20000", NoteStatus.Draft);

    await pay("100000");

    expect(await invoiceStatus()).toBe(InvoiceStatus.Paid);
  });

  test("a credit note for the whole total settles the invoice without a payment", async () => {
    const { saleNote, invoiceStatus } = await setup();
    await saleNote(NoteType.Credit, "100000");

    expect(await invoiceStatus()).toBe(InvoiceStatus.Paid);
  });

  test("a partial credit note with nothing paid leaves the invoice sent", async () => {
    const { saleNote, invoiceStatus } = await setup();
    await saleNote(NoteType.Credit, "20000");

    expect(await invoiceStatus()).toBe(InvoiceStatus.Sent);
  });

  test("a credit note for the unpaid rest settles a partly paid invoice", async () => {
    const { saleNote, pay, invoiceStatus } = await setup();
    await pay("80000");
    expect(await invoiceStatus()).toBe(InvoiceStatus.PartiallyPaid);

    await saleNote(NoteType.Credit, "20000");

    expect(await invoiceStatus()).toBe(InvoiceStatus.Paid);
  });

  test("a debit note reopens a paid invoice until the extra is paid", async () => {
    const { saleNote, pay, invoiceStatus } = await setup();
    await pay("100000");
    await saleNote(NoteType.Debit, "10000");

    expect(await invoiceStatus()).toBe(InvoiceStatus.PartiallyPaid);
    await pay("10000");
    expect(await invoiceStatus()).toBe(InvoiceStatus.Paid);
  });

  test("deleting a payment recomputes the status with the notes", async () => {
    const { services, saleNote, pay, invoiceStatus } = await setup();
    await saleNote(NoteType.Credit, "20000");
    const payment = await pay("80000");
    expect(await invoiceStatus()).toBe(InvoiceStatus.Paid);

    await services.payments.delete(payment.id, ctx);

    expect(await invoiceStatus()).toBe(InvoiceStatus.Sent);
  });

  test("issuing a draft note settles the invoice", async () => {
    const { services, saleNote, invoiceStatus } = await setup();
    const draft = await saleNote(NoteType.Credit, "100000", NoteStatus.Draft);
    expect(await invoiceStatus()).toBe(InvoiceStatus.Sent);

    await services.notes.update(draft.id, { status: NoteStatus.Issued } as any, ctx);

    expect(await invoiceStatus()).toBe(InvoiceStatus.Paid);
  });

  test("deleting an issued note recomputes the status", async () => {
    const { services, saleNote, pay, invoiceStatus } = await setup();
    const credit = await saleNote(NoteType.Credit, "20000");
    await pay("80000");
    expect(await invoiceStatus()).toBe(InvoiceStatus.Paid);

    await services.notes.delete(credit.id, ctx);

    expect(await invoiceStatus()).toBe(InvoiceStatus.PartiallyPaid);
  });

  test("vendor bill: a payment can't exceed what is left after an issued credit note", async () => {
    const { purchaseNote, payBill, billStatus } = await setup();
    await purchaseNote(NoteType.Credit, "10000");

    await expect(payBill("50000")).rejects.toThrow(ErrorCode.VendorBillPaymentExceedsTotal);
    await payBill("40000");

    expect(await billStatus()).toBe(VendorBillStatus.Paid);
  });

  test("vendor bill: a credit note for the whole total settles the bill", async () => {
    const { purchaseNote, billStatus } = await setup();
    await purchaseNote(NoteType.Credit, "50000");

    expect(await billStatus()).toBe(VendorBillStatus.Paid);
  });
});
