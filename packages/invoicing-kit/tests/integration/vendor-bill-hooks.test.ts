import { describe, it, expect } from "vitest";
import { createInvoicingKit } from "../../src/create";
import { inMemoryAdapter } from "../../src/adapters/memory";
import type { InvoicingKitHooks } from "../../src/config";
import type { AuthContext } from "../../src/auth/types";

const ctx: AuthContext = { userId: "u1", organizationId: "org1", role: "owner" };

function makeKit(hooks: InvoicingKitHooks) {
  const repos = inMemoryAdapter();
  return createInvoicingKit({ adapter: repos, auth: {} as never, hooks });
}

async function seedVendor(k: ReturnType<typeof makeKit>) {
  const v = await k.services.vendors.create({ name: "Proveedor", taxId: "130000001", taxIdType: "RNC" }, ctx);
  return v.id;
}

const line = () => ({ source: { type: "expense", id: "e1", name: "Servicio" }, quantity: "1", price: "100000", taxIds: [] as string[] });
const baseBill = (vendorId: string) => ({
  vendorId,
  externalDocumentNumber: "B0100000001",
  issueDate: "2026-01-15",
  currency: "DOP",
  lineItems: [line()],
});

describe("onVendorBillRecorded hook", () => {
  it("fires when a bill is created non-draft (status 'received')", async () => {
    const seen: string[] = [];
    const k = makeKit({ onVendorBillRecorded: ({ vendorBillId }) => void seen.push(vendorBillId) });
    const vendorId = await seedVendor(k);
    const bill = await k.services.vendorBills.create({ ...baseBill(vendorId), status: "received" }, ctx);
    expect(seen).toEqual([bill.id]);
  });

  it("does NOT fire when created as 'draft'", async () => {
    const seen: string[] = [];
    const k = makeKit({ onVendorBillRecorded: ({ vendorBillId }) => void seen.push(vendorBillId) });
    const vendorId = await seedVendor(k);
    await k.services.vendorBills.create({ ...baseBill(vendorId), status: "draft" }, ctx);
    expect(seen).toEqual([]);
  });

  it("fires once on draft->received via update", async () => {
    const seen: string[] = [];
    const k = makeKit({ onVendorBillRecorded: ({ vendorBillId }) => void seen.push(vendorBillId) });
    const vendorId = await seedVendor(k);
    const bill = await k.services.vendorBills.create({ ...baseBill(vendorId), status: "draft" }, ctx);
    expect(seen).toEqual([]);
    await k.services.vendorBills.update(bill.id, { status: "received" }, ctx);
    expect(seen).toEqual([bill.id]);
    await k.services.vendorBills.update(bill.id, { status: "paid" }, ctx);
    expect(seen).toEqual([bill.id]);
  });

  it("a throwing handler does not fail create (bill still persisted)", async () => {
    const k = makeKit({ onVendorBillRecorded: () => { throw new Error("boom"); } });
    const vendorId = await seedVendor(k);
    const bill = await k.services.vendorBills.create({ ...baseBill(vendorId), status: "received" }, ctx);
    expect(bill.id).toBeTruthy();
    const found = await k.services.vendorBills.findById(bill.id, ctx);
    expect(found.id).toBe(bill.id);
  });
});

describe("onVendorBillPaymentSucceeded hook", () => {
  it("fires after a manual vendor-bill payment is recorded", async () => {
    const seen: string[] = [];
    const k = makeKit({ onVendorBillPaymentSucceeded: ({ vendorBillPaymentId }) => void seen.push(vendorBillPaymentId) });
    const vendorId = await seedVendor(k);
    const bill = await k.services.vendorBills.create({ ...baseBill(vendorId), status: "received" }, ctx);
    const pay = await k.services.vendorBillPayments.recordManualVendorBillPayment(
      bill.id, { amount: "100000", currency: "DOP", provider: "manual" }, ctx);
    expect(seen).toEqual([pay.id]);
  });

  it("a throwing handler does not fail the payment", async () => {
    const k = makeKit({ onVendorBillPaymentSucceeded: () => { throw new Error("boom"); } });
    const vendorId = await seedVendor(k);
    const bill = await k.services.vendorBills.create({ ...baseBill(vendorId), status: "received" }, ctx);
    const pay = await k.services.vendorBillPayments.recordManualVendorBillPayment(
      bill.id, { amount: "100000", currency: "DOP", provider: "manual" }, ctx);
    expect(pay.id).toBeTruthy();
  });
});
