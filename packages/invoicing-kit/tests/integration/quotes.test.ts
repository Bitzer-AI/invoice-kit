import { test, expect, describe } from "vitest";
import { buildHarness } from "./harness";
import { createInvoicingKit } from "../../src/create";

// Helper: create prerequisites (client, product, tax) and return their IDs.
async function createPrereqs(request: (input: string, init?: RequestInit) => Promise<Response>) {
  const clientRes = await request("/api/bills/clients", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name: "Quote Client" }),
  });
  const client = await clientRes.json();

  const productRes = await request("/api/bills/products", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name: "Widget", price: "100.00" }),
  });
  const product = await productRes.json();

  const taxRes = await request("/api/bills/taxes", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name: "VAT", type: "PERCENTAGE", rate: "0.2100" }),
  });
  const tax = await taxRes.json();

  return { clientId: client.id as string, productId: product.id as string, taxId: tax.id as string };
}

describe("quotes integration", () => {
  test("POST /quotes creates a quote with totals computed (qty 1, price 10000, VAT 21%)", async () => {
    const { request } = await buildHarness(createInvoicingKit);
    const { clientId, productId, taxId } = await createPrereqs(request);

    const res = await request("/api/bills/quotes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        clientId,
        issueDate: "2025-01-01",
        lineItems: [
          {
            productId,
            quantity: "1",
            price: "10000",
            taxIds: [taxId],
          },
        ],
      }),
    });

    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.id).toBeTruthy();
    expect(body.status).toBe("draft");
    expect(body.document.clientId).toBe(clientId);
    // subtotal = 10000, tax = 2100 (21%), total = 12100
    expect(body.document.subtotal).toBe("10000");
    expect(body.document.tax).toBe("2100");
    expect(body.document.total).toBe("12100");
    expect(body.document.lineItems).toHaveLength(1);
    expect(body.document.lineItems[0].price).toBe("10000");
    expect(body.document.lineItems[0].taxAmount).toBe("2100");
    expect(body.document.lineItems[0].total).toBe("12100");
    expect(body.document.lineItems[0].taxes).toHaveLength(1);
    expect(body.document.lineItems[0].taxes[0].taxId).toBe(taxId);
    expect(body.document.lineItems[0].taxes[0].taxAmount).toBe("2100");
  });

  test("quote wire response includes document.currency (create + get)", async () => {
    const { request } = await buildHarness(createInvoicingKit);
    const { clientId, productId, taxId } = await createPrereqs(request);

    const createRes = await request("/api/bills/quotes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        clientId,
        issueDate: "2025-01-01",
        currency: "USD",
        lineItems: [{ productId, quantity: "1", price: "10000", taxIds: [taxId] }],
      }),
    });
    expect(createRes.status).toBe(201);
    const created = await createRes.json();
    // Regression guard: the serializer previously dropped currency from the wire document
    // (vendor-bills/notes included it, invoices/quotes did not), so the client fell back to a default.
    expect(created.document.currency).toBe("usd");

    const getRes = await request(`/api/bills/quotes/${created.id}`, { method: "GET" });
    expect(getRes.status).toBe(200);
    const fetched = await getRes.json();
    expect(fetched.document.currency).toBe("usd");
  });

  test("quotes.create persists per-line metadata and round-trips it on update", async () => {
    const { request, services, ctx } = await buildHarness(createInvoicingKit);
    const { clientId, productId, taxId } = await createPrereqs(request);

    const bookingMetadata = {
      booking: { availabilityId: 7, adults: 2, children: 0, infants: 0 },
    };

    const quote = await services.quotes.create(
      {
        clientId,
        issueDate: "2025-01-01",
        status: "draft",
        paymentMethodIds: [],
        lineItems: [
          { productId, quantity: "1", price: "10000", taxIds: [taxId], metadata: bookingMetadata },
        ],
      },
      ctx,
    );

    const found = await services.quotes.findById(quote.id, ctx);
    expect(found.document.lineItems[0].metadata).toEqual(bookingMetadata);

    const updatedMetadata = {
      booking: { availabilityId: 9, adults: 3, children: 1, infants: 0 },
    };
    await services.quotes.update(
      quote.id,
      {
        lineItems: [
          { productId, quantity: "1", price: "10000", taxIds: [taxId], metadata: updatedMetadata },
        ],
      },
      ctx,
    );

    const reread = await services.quotes.findById(quote.id, ctx);
    expect(reread.document.lineItems[0].metadata).toEqual(updatedMetadata);
  });

  test("quote wire response includes line item metadata (create + get)", async () => {
    const { request } = await buildHarness(createInvoicingKit);
    const { clientId, productId, taxId } = await createPrereqs(request);

    const bookingMetadata = {
      booking: { availabilityId: 7, adults: 2, children: 0, infants: 0 },
    };

    const createRes = await request("/api/bills/quotes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        clientId,
        issueDate: "2025-01-01",
        lineItems: [
          { productId, quantity: "1", price: "10000", taxIds: [taxId], metadata: bookingMetadata },
        ],
      }),
    });
    expect(createRes.status).toBe(201);
    const created = await createRes.json();
    expect(created.document.lineItems[0].metadata).toEqual(bookingMetadata);

    const getRes = await request(`/api/bills/quotes/${created.id}`, { method: "GET" });
    expect(getRes.status).toBe(200);
    const fetched = await getRes.json();
    expect(fetched.document.lineItems[0].metadata).toEqual(bookingMetadata);
  });

  test("GET /quotes/{id} returns the full joined document with line items", async () => {
    const { request } = await buildHarness(createInvoicingKit);
    const { clientId, productId, taxId } = await createPrereqs(request);

    const created = await (
      await request("/api/bills/quotes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          clientId,
          issueDate: "2025-02-01",
          lineItems: [{ productId, quantity: "2", price: "5000", taxIds: [taxId] }],
        }),
      })
    ).json();

    const res = await request(`/api/bills/quotes/${created.id}`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.id).toBe(created.id);
    expect(body.documentId).toBeTruthy();
    expect(body.document.lineItems).toHaveLength(1);
    expect(body.document.lineItems[0].quantity).toBe("2");
  });

  test("GET /quotes lists filtered by status (comma-separated)", async () => {
    const { request } = await buildHarness(createInvoicingKit);
    const { clientId, productId } = await createPrereqs(request);

    // Create a draft quote
    await request("/api/bills/quotes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        clientId,
        issueDate: "2025-03-01",
        status: "draft",
        lineItems: [{ productId, quantity: "1", price: "1000", taxIds: [] }],
      }),
    });

    // Create a sent quote
    await request("/api/bills/quotes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        clientId,
        issueDate: "2025-03-02",
        status: "sent",
        lineItems: [{ productId, quantity: "1", price: "2000", taxIds: [] }],
      }),
    });

    // Filter by draft only
    const res = await request("/api/bills/quotes?status=draft");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.every((q: any) => q.status === "draft")).toBe(true);

    // Filter by both draft and sent
    const res2 = await request("/api/bills/quotes?status=draft,sent");
    const body2 = await res2.json();
    expect(body2.data.length).toBeGreaterThanOrEqual(2);
  });

  test("PATCH /quotes/{id} updates status from draft to sent", async () => {
    const { request } = await buildHarness(createInvoicingKit);
    const { clientId, productId } = await createPrereqs(request);

    const created = await (
      await request("/api/bills/quotes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          clientId,
          issueDate: "2025-04-01",
          lineItems: [{ productId, quantity: "1", price: "3000", taxIds: [] }],
        }),
      })
    ).json();

    expect(created.status).toBe("draft");

    const res = await request(`/api/bills/quotes/${created.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "sent" }),
    });
    expect(res.status).toBe(200);
    const updated = await res.json();
    expect(updated.status).toBe("sent");
    expect(updated.id).toBe(created.id);
  });

  test("PATCH /quotes/{id} replaces line items and recomputes totals", async () => {
    const { request } = await buildHarness(createInvoicingKit);
    const { clientId, productId, taxId } = await createPrereqs(request);

    const created = await (
      await request("/api/bills/quotes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          clientId,
          issueDate: "2025-05-01",
          lineItems: [{ productId, quantity: "1", price: "1000", taxIds: [] }],
        }),
      })
    ).json();

    expect(created.document.total).toBe("1000");

    // Replace with a line item that has tax
    const res = await request(`/api/bills/quotes/${created.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        lineItems: [{ productId, quantity: "1", price: "10000", taxIds: [taxId] }],
      }),
    });
    expect(res.status).toBe(200);
    const updated = await res.json();
    // New totals: subtotal=10000, tax=2100, total=12100
    expect(updated.document.subtotal).toBe("10000");
    expect(updated.document.tax).toBe("2100");
    expect(updated.document.total).toBe("12100");
    expect(updated.document.lineItems).toHaveLength(1);
    expect(updated.document.lineItems[0].taxAmount).toBe("2100");
  });

  test("DELETE /quotes/{id} returns 204 and follow-up GET returns 404", async () => {
    const { request } = await buildHarness(createInvoicingKit);
    const { clientId, productId } = await createPrereqs(request);

    const created = await (
      await request("/api/bills/quotes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          clientId,
          issueDate: "2025-06-01",
          lineItems: [{ productId, quantity: "1", price: "5000", taxIds: [] }],
        }),
      })
    ).json();

    const del = await request(`/api/bills/quotes/${created.id}`, { method: "DELETE" });
    expect(del.status).toBe(204);

    const after = await request(`/api/bills/quotes/${created.id}`);
    expect(after.status).toBe(404);
  });

  test("bulk-status then bulk-delete act on many quotes at once", async () => {
    const { request } = await buildHarness(createInvoicingKit);
    const { clientId, productId } = await createPrereqs(request);

    const ids: string[] = [];
    for (let n = 0; n < 3; n++) {
      const created = await (
        await request("/api/bills/quotes", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            clientId,
            issueDate: "2025-07-01",
            lineItems: [{ productId, quantity: "1", price: "1000", taxIds: [] }],
          }),
        })
      ).json();
      ids.push(created.id);
    }

    const statusRes = await request("/api/bills/quotes/bulk-status", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids, status: "accepted" }),
    });
    expect(statusRes.status).toBe(200);
    expect((await statusRes.json()).count).toBe(3);

    const accepted = await (await request("/api/bills/quotes?status=accepted")).json();
    expect(accepted.data.length).toBe(3);

    const delRes = await request("/api/bills/quotes/bulk-delete", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids: ids.slice(0, 2) }),
    });
    expect(delRes.status).toBe(200);
    expect((await delRes.json()).count).toBe(2);

    const remaining = await (await request("/api/bills/quotes")).json();
    expect(remaining.data.length).toBe(1);
  });
});
