import { test, expect, describe } from "vitest";
import { buildHarness } from "./harness";
import { createInvoicingKit } from "../../src/create";

// Helper: create prerequisites (client, product, tax) and return their IDs.
async function createPrereqs(request: (input: string, init?: RequestInit) => Promise<Response>) {
  const clientRes = await request("/api/bills/clients", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name: "Invoice Client" }),
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

// Helper: create a quote and return the parsed body.
async function createQuote(
  request: (input: string, init?: RequestInit) => Promise<Response>,
  clientId: string,
  productId: string,
  taxId: string,
) {
  const res = await request("/api/bills/quotes", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      clientId,
      issueDate: "2025-01-01",
      lineItems: [{ productId, quantity: "1", price: "10000", taxIds: [taxId] }],
    }),
  });
  return res.json();
}

describe("invoices integration", () => {
  test("POST /invoices creates an invoice with one line item and correct totals", async () => {
    const { request } = await buildHarness(createInvoicingKit);
    const { clientId, productId, taxId } = await createPrereqs(request);

    const res = await request("/api/bills/invoices", {
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
    expect(body.paidDate).toBeNull();
    expect(body.convertedFromQuoteId).toBeNull();
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

  test("invoices.create accepts and stores currency", async () => {
    const { request, services, ctx } = await buildHarness(createInvoicingKit);
    const { clientId, productId, taxId } = await createPrereqs(request);

    const invoice = await services.invoices.create(
      {
        clientId,
        issueDate: "2025-01-01",
        currency: "DOP",
        status: "draft",
        paymentMethodIds: [],
        lineItems: [{ productId, quantity: "1", price: "10000", taxIds: [taxId] }],
      },
      ctx,
    );

    const found = await services.invoices.findById(invoice.id, ctx);
    expect(found.document.currency).toBe("DOP");
  });

  test("invoice wire response includes document.currency (create + get)", async () => {
    const { request } = await buildHarness(createInvoicingKit);
    const { clientId, productId, taxId } = await createPrereqs(request);

    const createRes = await request("/api/bills/invoices", {
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
    expect(created.document.currency).toBe("USD");

    const getRes = await request(`/api/bills/invoices/${created.id}`, { method: "GET" });
    expect(getRes.status).toBe(200);
    const fetched = await getRes.json();
    expect(fetched.document.currency).toBe("USD");
  });

  test("invoices.create persists per-line metadata and round-trips it on update", async () => {
    const { request, services, ctx } = await buildHarness(createInvoicingKit);
    const { clientId, productId, taxId } = await createPrereqs(request);

    const bookingMetadata = {
      booking: { availabilityId: 7, adults: 2, children: 0, infants: 0 },
    };

    const invoice = await services.invoices.create(
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

    const found = await services.invoices.findById(invoice.id, ctx);
    expect(found.document.lineItems[0].metadata).toEqual(bookingMetadata);

    const updatedMetadata = {
      booking: { availabilityId: 9, adults: 3, children: 1, infants: 0 },
    };
    await services.invoices.update(
      invoice.id,
      {
        lineItems: [
          { productId, quantity: "1", price: "10000", taxIds: [taxId], metadata: updatedMetadata },
        ],
      },
      ctx,
    );

    const reread = await services.invoices.findById(invoice.id, ctx);
    expect(reread.document.lineItems[0].metadata).toEqual(updatedMetadata);
  });

  test("invoice wire response includes line item metadata (create + get)", async () => {
    const { request } = await buildHarness(createInvoicingKit);
    const { clientId, productId, taxId } = await createPrereqs(request);

    const bookingMetadata = {
      booking: { availabilityId: 7, adults: 2, children: 0, infants: 0 },
    };

    const createRes = await request("/api/bills/invoices", {
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

    const getRes = await request(`/api/bills/invoices/${created.id}`, { method: "GET" });
    expect(getRes.status).toBe(200);
    const fetched = await getRes.json();
    expect(fetched.document.lineItems[0].metadata).toEqual(bookingMetadata);
  });

  test("POST /invoices honors a one-off documentNumber override without advancing the series", async () => {
    const { request } = await buildHarness(createInvoicingKit);
    const { clientId, productId, taxId } = await createPrereqs(request);

    const overridden = await (
      await request("/api/bills/invoices", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          clientId,
          documentNumber: 5000,
          issueDate: "2025-01-01",
          lineItems: [{ productId, quantity: "1", price: "10000", taxIds: [taxId] }],
        }),
      })
    ).json();
    expect(overridden.document.documentNumber).toBe(5000);

    // A subsequent auto-numbered invoice uses the series counter (starts at 1),
    // unaffected by the one-off override above.
    const auto = await (
      await request("/api/bills/invoices", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          clientId,
          issueDate: "2025-01-02",
          lineItems: [{ productId, quantity: "1", price: "10000", taxIds: [taxId] }],
        }),
      })
    ).json();
    expect(auto.document.documentNumber).toBe(1);
  });

  test("GET /invoices/{id} returns the full joined document with line items", async () => {
    const { request } = await buildHarness(createInvoicingKit);
    const { clientId, productId, taxId } = await createPrereqs(request);

    const created = await (
      await request("/api/bills/invoices", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          clientId,
          issueDate: "2025-02-01",
          lineItems: [{ productId, quantity: "2", price: "5000", taxIds: [taxId] }],
        }),
      })
    ).json();

    const res = await request(`/api/bills/invoices/${created.id}`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.id).toBe(created.id);
    expect(body.documentId).toBeTruthy();
    expect(body.convertedFromQuoteId).toBeNull();
    expect(body.document.lineItems).toHaveLength(1);
    expect(body.document.lineItems[0].quantity).toBe("2");
  });

  test("PATCH /invoices/{id} with status 'paid' auto-sets paidDate", async () => {
    const { request } = await buildHarness(createInvoicingKit);
    const { clientId, productId } = await createPrereqs(request);

    const created = await (
      await request("/api/bills/invoices", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          clientId,
          issueDate: "2025-03-01",
          lineItems: [{ productId, quantity: "1", price: "5000", taxIds: [] }],
        }),
      })
    ).json();

    expect(created.status).toBe("draft");
    expect(created.paidDate).toBeNull();

    const res = await request(`/api/bills/invoices/${created.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "paid" }),
    });
    expect(res.status).toBe(200);
    const updated = await res.json();
    expect(updated.status).toBe("paid");
    expect(updated.paidDate).not.toBeNull();
    // paidDate should be a valid YYYY-MM-DD string
    expect(updated.paidDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  test("GET /invoices lists filtered by status (comma-separated)", async () => {
    const { request } = await buildHarness(createInvoicingKit);
    const { clientId, productId } = await createPrereqs(request);

    // Create a draft invoice
    await request("/api/bills/invoices", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        clientId,
        issueDate: "2025-04-01",
        status: "draft",
        lineItems: [{ productId, quantity: "1", price: "1000", taxIds: [] }],
      }),
    });

    // Create a sent invoice
    await request("/api/bills/invoices", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        clientId,
        issueDate: "2025-04-02",
        status: "sent",
        lineItems: [{ productId, quantity: "1", price: "2000", taxIds: [] }],
      }),
    });

    // Filter by draft only
    const res = await request("/api/bills/invoices?status=draft");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.every((i: any) => i.status === "draft")).toBe(true);

    // Filter by both draft and sent
    const res2 = await request("/api/bills/invoices?status=draft,sent");
    const body2 = await res2.json();
    expect(body2.data.length).toBeGreaterThanOrEqual(2);
  });

  test("GET /invoices lists filtered by clientId", async () => {
    const { request } = await buildHarness(createInvoicingKit);
    const { clientId, productId } = await createPrereqs(request);

    // Create a second client
    const client2Res = await request("/api/bills/clients", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Other Client" }),
    });
    const client2 = await client2Res.json();

    // Invoice for clientId
    await request("/api/bills/invoices", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        clientId,
        issueDate: "2025-05-01",
        lineItems: [{ productId, quantity: "1", price: "1000", taxIds: [] }],
      }),
    });

    // Invoice for client2
    await request("/api/bills/invoices", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        clientId: client2.id,
        issueDate: "2025-05-02",
        lineItems: [{ productId, quantity: "1", price: "2000", taxIds: [] }],
      }),
    });

    const res = await request(`/api/bills/invoices?clientId=${clientId}`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.every((i: any) => i.document.clientId === clientId)).toBe(true);
    expect(body.data.length).toBeGreaterThanOrEqual(1);
  });

  test("DELETE /invoices/{id} returns 204 and follow-up GET returns 404", async () => {
    const { request } = await buildHarness(createInvoicingKit);
    const { clientId, productId } = await createPrereqs(request);

    const created = await (
      await request("/api/bills/invoices", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          clientId,
          issueDate: "2025-06-01",
          lineItems: [{ productId, quantity: "1", price: "5000", taxIds: [] }],
        }),
      })
    ).json();

    const del = await request(`/api/bills/invoices/${created.id}`, { method: "DELETE" });
    expect(del.status).toBe(204);

    const after = await request(`/api/bills/invoices/${created.id}`);
    expect(after.status).toBe(404);
  });

  test("POST /invoices/from-quote/{quoteId} converts a quote to an invoice", async () => {
    const { request } = await buildHarness(createInvoicingKit);
    const { clientId, productId, taxId } = await createPrereqs(request);

    const quote = await createQuote(request, clientId, productId, taxId);
    expect(quote.status).toBe("draft");

    const res = await request(`/api/bills/invoices/from-quote/${quote.id}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });

    expect(res.status).toBe(201);
    const invoice = await res.json();
    expect(invoice.id).toBeTruthy();
    expect(invoice.status).toBe("draft");
    expect(invoice.convertedFromQuoteId).toBe(quote.id);
    expect(invoice.paidDate).toBeNull();

    // Totals must match the original quote
    expect(invoice.document.subtotal).toBe(quote.document.subtotal);
    expect(invoice.document.tax).toBe(quote.document.tax);
    expect(invoice.document.total).toBe(quote.document.total);
    expect(invoice.document.lineItems).toHaveLength(1);

    // Verify the quote is now "converted"
    const quoteRes = await request(`/api/bills/quotes/${quote.id}`);
    const updatedQuote = await quoteRes.json();
    expect(updatedQuote.status).toBe("converted");
  });

  test("POST /invoices/from-quote/{quoteId} returns 409 on double-convert", async () => {
    const { request } = await buildHarness(createInvoicingKit);
    const { clientId, productId, taxId } = await createPrereqs(request);

    const quote = await createQuote(request, clientId, productId, taxId);

    // First conversion succeeds
    const first = await request(`/api/bills/invoices/from-quote/${quote.id}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    expect(first.status).toBe(201);

    // Second conversion should return 409
    const second = await request(`/api/bills/invoices/from-quote/${quote.id}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    expect(second.status).toBe(409);
  });

  test("bulk-status then bulk-delete act on many invoices at once", async () => {
    const { request } = await buildHarness(createInvoicingKit);
    const { clientId, productId } = await createPrereqs(request);

    const ids: string[] = [];
    for (let n = 0; n < 3; n++) {
      const created = await (
        await request("/api/bills/invoices", {
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

    const statusRes = await request("/api/bills/invoices/bulk-status", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids, status: "sent" }),
    });
    expect(statusRes.status).toBe(200);
    expect((await statusRes.json()).count).toBe(3);

    const sent = await (await request("/api/bills/invoices?status=sent")).json();
    expect(sent.data.length).toBe(3);

    const delRes = await request("/api/bills/invoices/bulk-delete", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids: ids.slice(0, 2) }),
    });
    expect(delRes.status).toBe(200);
    expect((await delRes.json()).count).toBe(2);

    const remaining = await (await request("/api/bills/invoices")).json();
    expect(remaining.data.length).toBe(1);
  });
});
