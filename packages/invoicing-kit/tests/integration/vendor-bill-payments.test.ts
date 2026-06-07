import { test, expect, describe } from "vitest";
import { buildHarness } from "./harness";
import { createInvoicingKit } from "../../src/create";
import { inMemoryAdapter } from "../../src/adapters/memory";
import type { InvoicingKitHooks } from "../../src/config";
import type { AuthContext } from "../../src/auth/types";
import { randomUUID } from "node:crypto";

async function makeBill(request: any, price = "100000") {
  const vendorRes = await request("/api/bills/vendors", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name: "Proveedor", taxId: "130000001", taxIdType: "RNC" }),
  });
  const vendorId = (await vendorRes.json()).id;
  const billRes = await request("/api/bills/vendor-bills", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      vendorId,
      issueDate: "2026-01-15",
      status: "received",
      currency: "DOP",
      lineItems: [{ source: { type: "expense", id: "e1", name: "Servicio" }, quantity: "1", price, taxIds: [] }],
    }),
  });
  return (await billRes.json()).id as string;
}

describe("vendor bill payments integration", () => {
  test("POST /vendor-bills/{id}/payments records a payment and marks paid when total reached", async () => {
    const { request } = await buildHarness(createInvoicingKit);
    const billId = await makeBill(request, "100000");
    const res = await request(`/api/bills/vendor-bills/${billId}/payments`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ amount: "100000", currency: "DOP", provider: "manual" }),
    });
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.amount).toBe("100000");
    expect(body.status).toBe("succeeded");
    const bill = await (await request(`/api/bills/vendor-bills/${billId}`)).json();
    expect(bill.status).toBe("paid");
  });

  test("a partial payment moves the bill to partially_paid", async () => {
    const { request } = await buildHarness(createInvoicingKit);
    const billId = await makeBill(request, "100000");
    // Bill starts 'received'.
    const before = await (await request(`/api/bills/vendor-bills/${billId}`)).json();
    expect(before.status).toBe("received");

    await request(`/api/bills/vendor-bills/${billId}/payments`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ amount: "40000", currency: "DOP", provider: "manual" }),
    });
    const bill = await (await request(`/api/bills/vendor-bills/${billId}`)).json();
    expect(bill.status).toBe("partially_paid");
  });

  test("partial then remaining payment rolls received -> partially_paid -> paid", async () => {
    const { request } = await buildHarness(createInvoicingKit);
    const billId = await makeBill(request, "100000");

    await request(`/api/bills/vendor-bills/${billId}/payments`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ amount: "60000", currency: "DOP", provider: "manual" }),
    });
    const afterPartial = await (await request(`/api/bills/vendor-bills/${billId}`)).json();
    expect(afterPartial.status).toBe("partially_paid");

    await request(`/api/bills/vendor-bills/${billId}/payments`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ amount: "40000", currency: "DOP", provider: "manual" }),
    });
    const afterFull = await (await request(`/api/bills/vendor-bills/${billId}`)).json();
    expect(afterFull.status).toBe("paid");
  });

  test("deleting the only (full) payment reverts the bill received <- paid", async () => {
    const { request } = await buildHarness(createInvoicingKit);
    const billId = await makeBill(request, "100000");

    // Pay in full -> bill is "paid".
    const created = await (
      await request(`/api/bills/vendor-bills/${billId}/payments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amount: "100000", currency: "DOP", provider: "manual" }),
      })
    ).json();
    const paid = await (await request(`/api/bills/vendor-bills/${billId}`)).json();
    expect(paid.status).toBe("paid");

    // Delete the only payment -> remaining == 0 -> status reverts to "received".
    const del = await request(`/api/bills/vendor-bill-payments/${created.id}`, { method: "DELETE" });
    expect(del.status).toBe(204);

    const reverted = await (await request(`/api/bills/vendor-bills/${billId}`)).json();
    expect(reverted.status).toBe("received");
    // No payments remain.
    const list = await (await request(`/api/bills/vendor-bills/${billId}/payments`)).json();
    expect(list.data).toHaveLength(0);
  });

  test("a payment exceeding the bill total is rejected (400)", async () => {
    const { request } = await buildHarness(createInvoicingKit);
    const billId = await makeBill(request, "100000");
    const res = await request(`/api/bills/vendor-bills/${billId}/payments`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ amount: "100001", currency: "DOP", provider: "manual" }),
    });
    expect(res.status).toBe(400);
  });

  test("a payment against a non-existent bill is rejected (404)", async () => {
    const { request } = await buildHarness(createInvoicingKit);
    const res = await request(`/api/bills/vendor-bills/${randomUUID()}/payments`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ amount: "1000", currency: "DOP", provider: "manual" }),
    });
    expect(res.status).toBe(404);
  });

  test("GET /vendor-bills/{id}/payments lists payments", async () => {
    const { request } = await buildHarness(createInvoicingKit);
    const billId = await makeBill(request, "100000");
    await request(`/api/bills/vendor-bills/${billId}/payments`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ amount: "50000", currency: "DOP", provider: "manual" }),
    });
    const list = await (await request(`/api/bills/vendor-bills/${billId}/payments`)).json();
    expect(list.data).toHaveLength(1);
  });

  test("GET /vendor-bill-payments/{id} returns the payment", async () => {
    const { request } = await buildHarness(createInvoicingKit);
    const billId = await makeBill(request, "100000");
    const created = await (
      await request(`/api/bills/vendor-bills/${billId}/payments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amount: "50000", currency: "DOP", provider: "manual" }),
      })
    ).json();
    const got = await request(`/api/bills/vendor-bill-payments/${created.id}`);
    expect(got.status).toBe(200);
    expect((await got.json()).id).toBe(created.id);
  });

  // Cross-org isolation. buildHarness TRUNCATEs on entry, so we don't spin up a
  // second harness (that would wipe org A's data). Instead we drive the same
  // kit's service layer with org B's AuthContext — exactly what the router does
  // after auth resolves. Org B must NOT be able to record against, read, or
  // delete org A's bill/payment.
  test("org A cannot record against / read org B's bill or payment (cross-org -> 404)", async () => {
    const a = await buildHarness(createInvoicingKit);
    const billId = await makeBill(a.request, "100000");
    const paymentA = await (
      await a.request(`/api/bills/vendor-bills/${billId}/payments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amount: "50000", currency: "DOP", provider: "manual" }),
      })
    ).json();

    const ctxB: AuthContext = {
      userId: randomUUID(),
      organizationId: randomUUID(),
      role: "owner",
    };

    // Org B cannot record a payment against org A's bill (bill is "not found").
    await expect(
      a.services.vendorBillPayments.recordManualVendorBillPayment(
        billId,
        { amount: "1000", currency: "DOP", provider: "manual" },
        ctxB,
      ),
    ).rejects.toMatchObject({ status: 404 });

    // Org B cannot list org A's bill payments.
    await expect(
      a.services.vendorBillPayments.listForBill(billId, ctxB),
    ).rejects.toMatchObject({ status: 404 });

    // Org B cannot read org A's payment.
    await expect(
      a.services.vendorBillPayments.findById(paymentA.id, ctxB),
    ).rejects.toMatchObject({ status: 404 });

    // Org B cannot delete org A's payment.
    await expect(
      a.services.vendorBillPayments.delete(paymentA.id, ctxB),
    ).rejects.toMatchObject({ status: 404 });

    // Org A's data is untouched.
    const stillThere = await a.request(`/api/bills/vendor-bill-payments/${paymentA.id}`);
    expect(stillThere.status).toBe(200);
    const bill = await (await a.request(`/api/bills/vendor-bills/${billId}`)).json();
    expect(bill.status).toBe("partially_paid");
  });

  // Smoke-level coverage of the post-commit hook on the payment path. The full
  // matrix lives in the dedicated vendor-bill-hooks test (Task 12); here we just
  // prove it fires once with the right ids after the tx commits.
  describe("onVendorBillPaymentSucceeded hook (in-memory)", () => {
    const ctx: AuthContext = { userId: "u1", organizationId: "org1", role: "owner" };

    function makeKit(hooks: InvoicingKitHooks) {
      const repos = inMemoryAdapter();
      return createInvoicingKit({ adapter: repos, auth: {} as never, hooks });
    }

    async function seedBill(k: ReturnType<typeof makeKit>) {
      const vendor = await k.services.vendors.create({ name: "Proveedor SRL" }, ctx);
      const bill = await k.services.vendorBills.create(
        {
          vendorId: vendor.id,
          externalDocumentNumber: "B0100000123",
          issueDate: "2026-01-15",
          dueDate: null,
          notes: null,
          status: "received",
          lineItems: [
            { source: { type: "expense", id: "e1", name: "Servicio" }, quantity: "1", price: "100000", taxIds: [] },
          ],
        },
        ctx,
      );
      return bill;
    }

    test("fires once post-commit with {organizationId, vendorBillPaymentId}", async () => {
      const fired: Array<{ organizationId: string; vendorBillPaymentId: string }> = [];
      const k = makeKit({ onVendorBillPaymentSucceeded: (c) => void fired.push(c) });
      const bill = await seedBill(k);

      const payment = await k.services.vendorBillPayments.recordManualVendorBillPayment(
        bill.id,
        { amount: "100000", currency: "DOP", provider: "manual" },
        ctx,
      );

      expect(fired).toEqual([{ organizationId: "org1", vendorBillPaymentId: payment.id }]);
    });

    test("a throwing handler does not fail the payment (payment still persisted)", async () => {
      const k = makeKit({
        onVendorBillPaymentSucceeded: () => {
          throw new Error("boom");
        },
      });
      const bill = await seedBill(k);

      const payment = await k.services.vendorBillPayments.recordManualVendorBillPayment(
        bill.id,
        { amount: "100000", currency: "DOP", provider: "manual" },
        ctx,
      );

      expect(payment.id).toBeTruthy();
      const found = await k.services.vendorBillPayments.findById(payment.id, ctx);
      expect(found.id).toBe(payment.id);
    });
  });
});
