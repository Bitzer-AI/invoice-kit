import { test, expect, describe } from "vitest";
import { buildHarness } from "./harness";
import { createInvoicingKit } from "../../src/create";
import { inMemoryAdapter } from "../../src/adapters/memory";
import type { InvoicingKitHooks } from "../../src/config";
import type { AuthContext } from "../../src/auth/types";
import { randomUUID } from "node:crypto";

async function makeVendor(request: any, name = "Proveedor SRL") {
  const res = await request("/api/bills/vendors", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name, taxId: "130000001", taxIdType: "RNC" }),
  });
  return (await res.json()).id as string;
}

const line = (price: string) => ({
  productId: undefined,
  source: { type: "expense", id: "exp1", name: "Servicio" },
  quantity: "1",
  price,
  taxIds: [] as string[],
});

describe("vendor bills integration", () => {
  test("POST /vendor-bills creates a received bill with vendorId + externalDocumentNumber + currency", async () => {
    const { request } = await buildHarness(createInvoicingKit);
    const vendorId = await makeVendor(request);
    const res = await request("/api/bills/vendor-bills", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        vendorId,
        externalDocumentNumber: "B0100000123",
        issueDate: "2026-01-15",
        status: "received",
        currency: "DOP",
        lineItems: [line("100000")],
      }),
    });
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.status).toBe("received");
    expect(body.document.vendorId).toBe(vendorId);
    expect(body.document.clientId).toBeNull();
    expect(body.document.externalDocumentNumber).toBe("B0100000123");
    expect(body.document.currency).toBe("DOP");
    expect(body.document.total).toBe("100000");
  });

  test("POST /vendor-bills without vendorId is rejected (party invariant)", async () => {
    const { request } = await buildHarness(createInvoicingKit);
    const res = await request("/api/bills/vendor-bills", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ issueDate: "2026-01-15", status: "received", lineItems: [line("100000")] }),
    });
    // Missing vendorId fails Zod validation (400) — vendorId is required on the body.
    expect(res.status).toBe(400);
  });

  test("POST /vendor-bills with a non-existent vendorId is rejected (party invariant, existence)", async () => {
    const { request } = await buildHarness(createInvoicingKit);
    const res = await request("/api/bills/vendor-bills", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        vendorId: randomUUID(),
        issueDate: "2026-01-15",
        status: "received",
        lineItems: [line("100000")],
      }),
    });
    expect(res.status).toBe(404);
  });

  test("GET /vendor-bills/{id} returns the bill; GET /vendor-bills lists + filters by vendorId", async () => {
    const { request } = await buildHarness(createInvoicingKit);
    const vendorId = await makeVendor(request);
    const created = await (
      await request("/api/bills/vendor-bills", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ vendorId, issueDate: "2026-01-15", status: "received", lineItems: [line("50000")] }),
      })
    ).json();
    const got = await request(`/api/bills/vendor-bills/${created.id}`);
    expect(got.status).toBe(200);
    const list = await (await request(`/api/bills/vendor-bills?vendorId=${vendorId}`)).json();
    expect(list.data).toHaveLength(1);
    expect(list.data[0].id).toBe(created.id);
  });

  test("PATCH /vendor-bills/{id} updates status draft->received", async () => {
    const { request } = await buildHarness(createInvoicingKit);
    const vendorId = await makeVendor(request);
    const created = await (
      await request("/api/bills/vendor-bills", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ vendorId, issueDate: "2026-01-15", status: "draft", lineItems: [line("50000")] }),
      })
    ).json();
    const res = await request(`/api/bills/vendor-bills/${created.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "received" }),
    });
    expect(res.status).toBe(200);
    expect((await res.json()).status).toBe("received");
  });

  test("org A cannot fetch, update, or delete org B's vendor bill (cross-org isolation -> 404)", async () => {
    // Org A: create a vendor bill via HTTP.
    const a = await buildHarness(createInvoicingKit);
    const vendorIdA = await makeVendor(a.request);
    const billA = await (
      await a.request("/api/bills/vendor-bills", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ vendorId: vendorIdA, issueDate: "2026-01-15", status: "received", lineItems: [line("50000")] }),
      })
    ).json();

    // Org B: a real, distinct org (its own user/session/member row). buildHarness
    // TRUNCATEs on entry, so we DON'T spin up a second harness (that would wipe
    // org A's bill). Instead we drive the same kit's service layer with org B's
    // AuthContext — exactly what the router does after auth resolves.
    const ctxB: AuthContext = {
      userId: randomUUID(),
      organizationId: randomUUID(),
      role: "owner",
    };

    // GET / UPDATE / DELETE under org B must all behave as "not found".
    await expect(a.services.vendorBills.findById(billA.id, ctxB)).rejects.toMatchObject({
      status: 404,
    });
    await expect(
      a.services.vendorBills.update(billA.id, { status: "paid" }, ctxB),
    ).rejects.toMatchObject({ status: 404 });
    await expect(a.services.vendorBills.delete(billA.id, ctxB)).rejects.toMatchObject({
      status: 404,
    });

    // And org A's bill is untouched (still fetchable via HTTP, status unchanged).
    const stillThere = await a.request(`/api/bills/vendor-bills/${billA.id}`);
    expect(stillThere.status).toBe(200);
    expect((await stillThere.json()).status).toBe("received");
  });

  // Smoke-level coverage of the post-commit hook on the create path. The full
  // matrix (draft->received transition, throwing handler) lives in the dedicated
  // vendor-bill-hooks test (Task 12); here we just prove it fires once with the
  // right ids when a bill is created non-draft, and stays silent when draft.
  describe("onVendorBillRecorded hook (in-memory)", () => {
    const ctx: AuthContext = { userId: "u1", organizationId: "org1", role: "owner" };

    function makeKit(hooks: InvoicingKitHooks) {
      const repos = inMemoryAdapter();
      return createInvoicingKit({ adapter: repos, auth: {} as never, hooks });
    }

    const billBody = (vendorId: string) => ({
      vendorId,
      externalDocumentNumber: "B0100000123",
      issueDate: "2026-01-15",
      dueDate: null,
      notes: null,
      lineItems: [line("100000")],
    });

    test("fires once post-commit with {organizationId, vendorBillId} when created 'received'", async () => {
      const recorded: Array<{ organizationId: string; vendorBillId: string }> = [];
      const k = makeKit({ onVendorBillRecorded: (c) => void recorded.push(c) });
      const vendor = await k.services.vendors.create({ name: "Proveedor SRL" }, ctx);

      const bill = await k.services.vendorBills.create(
        { ...billBody(vendor.id), status: "received" },
        ctx,
      );

      expect(recorded).toEqual([{ organizationId: "org1", vendorBillId: bill.id }]);
    });

    test("does NOT fire when created as 'draft'", async () => {
      const recorded: unknown[] = [];
      const k = makeKit({ onVendorBillRecorded: (c) => void recorded.push(c) });
      const vendor = await k.services.vendors.create({ name: "Proveedor SRL" }, ctx);

      await k.services.vendorBills.create({ ...billBody(vendor.id), status: "draft" }, ctx);

      expect(recorded).toEqual([]);
    });
  });
});
