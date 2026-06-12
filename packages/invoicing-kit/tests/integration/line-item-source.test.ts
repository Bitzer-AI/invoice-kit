import { test, expect, describe } from "vitest";
import { buildHarness } from "./harness";
import { createInvoicingKit } from "../../src/create";

async function createClient(
  request: (input: string, init?: RequestInit) => Promise<Response>,
) {
  const res = await request("/api/bills/clients", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name: "Source Client" }),
  });
  return (await res.json()).id as string;
}

// One harness per test to limit Postgres connections (the harness opens a fresh
// PrismaClient per call); assertions for related behavior are grouped together.
describe("line item source resolution", () => {
  test("source line items find-or-create the product and reuse it across sales", async () => {
    const { request } = await buildHarness(createInvoicingKit);
    const clientId = await createClient(request);

    // First sale of experience 42 — product is auto-created.
    const first = await (
      await request("/api/bills/invoices", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          clientId,
          issueDate: "2025-01-01",
          lineItems: [
            {
              source: { type: "experience", id: "42", name: "Sunset Catamaran Tour" },
              quantity: "2",
              price: "5000",
              taxIds: [],
            },
          ],
        }),
      })
    ).json();

    const productId = first.document.lineItems[0].productId;
    expect(productId).toBeTruthy();
    // Line item keeps its own snapshot price (minor units).
    expect(first.document.lineItems[0].price).toBe("5000");

    const product = await (await request(`/api/bills/products/${productId}`)).json();
    expect(product.name).toBe("Sunset Catamaran Tour");
    expect(product.sourceType).toBe("experience");
    expect(product.sourceId).toBe("42");
    expect(product.price).toBe("50.00"); // 5000 minor units -> 50.00 catalog default

    // Second sale of the same experience (different price) reuses the product.
    const second = await (
      await request("/api/bills/invoices", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          clientId,
          issueDate: "2025-02-01",
          lineItems: [
            {
              source: { type: "experience", id: "42", name: "Sunset Catamaran Tour" },
              quantity: "1",
              price: "9000",
              taxIds: [],
            },
          ],
        }),
      })
    ).json();
    expect(second.document.lineItems[0].productId).toBe(productId);

    // Exactly one product exists for that source.
    const products = await (await request("/api/bills/products?perPage=100")).json();
    const matching = products.data.filter(
      (p: any) => p.sourceType === "experience" && p.sourceId === "42",
    );
    expect(matching).toHaveLength(1);

    // Quotes resolve source line items the same way.
    const quote = await (
      await request("/api/bills/quotes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          clientId,
          issueDate: "2025-03-01",
          lineItems: [
            {
              source: { type: "experience", id: "99", name: "Zip Line" },
              quantity: "1",
              price: "3000",
              taxIds: [],
            },
          ],
        }),
      })
    ).json();
    const quoteProduct = await (
      await request(`/api/bills/products/${quote.document.lineItems[0].productId}`)
    ).json();
    expect(quoteProduct.sourceType).toBe("experience");
    expect(quoteProduct.sourceId).toBe("99");
  });

  test("document reads surface `source` on each line item (round-trip)", async () => {
    const { request } = await buildHarness(createInvoicingKit);
    const clientId = await createClient(request);

    // A catalog product WITHOUT a source, for the null case.
    const catalogProduct = await (
      await request("/api/bills/products", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "Plain Service", price: "10.00" }),
      })
    ).json();

    const expectedSource = { type: "experience", id: "171", name: "Authentic Santo Domingo" };
    const created = await (
      await request("/api/bills/invoices", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          clientId,
          issueDate: "2025-04-01",
          lineItems: [
            {
              source: expectedSource,
              quantity: "1",
              price: "6500",
              taxIds: [],
              metadata: { booking: { availabilityId: 123, adults: 2, children: 1, infants: 0 } },
            },
            { productId: catalogProduct.id, quantity: "1", price: "1000", taxIds: [] },
          ],
        }),
      })
    ).json();

    // Source surfaces on the create response...
    const createdSourced = created.document.lineItems.find((line: any) => line.source !== null);
    expect(createdSourced.source).toEqual(expectedSource);

    // ...and on GET, alongside the booking metadata (the admin editor's exact need).
    const fetched = await (await request(`/api/bills/invoices/${created.id}`)).json();
    const sourcedLine = fetched.document.lineItems.find((line: any) => line.source !== null);
    expect(sourcedLine.source).toEqual(expectedSource);
    expect(sourcedLine.metadata).toEqual({
      booking: { availabilityId: 123, adults: 2, children: 1, infants: 0 },
    });
    const plainLine = fetched.document.lineItems.find(
      (line: any) => line.productId === catalogProduct.id,
    );
    expect(plainLine.source).toBeNull();

    // Quotes round-trip the same way.
    const quote = await (
      await request("/api/bills/quotes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          clientId,
          issueDate: "2025-04-02",
          lineItems: [{ source: expectedSource, quantity: "1", price: "6500", taxIds: [] }],
        }),
      })
    ).json();
    const fetchedQuote = await (await request(`/api/bills/quotes/${quote.id}`)).json();
    expect(fetchedQuote.document.lineItems[0].source).toEqual(expectedSource);
  });

  test("rejects a line item without exactly one of productId / source", async () => {
    const { request } = await buildHarness(createInvoicingKit);
    const clientId = await createClient(request);

    // Both productId and source.
    const both = await request("/api/bills/invoices", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        clientId,
        issueDate: "2025-01-01",
        lineItems: [
          {
            productId: "some-id",
            source: { type: "experience", id: "1", name: "X" },
            quantity: "1",
            price: "1000",
            taxIds: [],
          },
        ],
      }),
    });
    expect(both.status).toBe(400);

    // Neither productId nor source.
    const neither = await request("/api/bills/invoices", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        clientId,
        issueDate: "2025-01-01",
        lineItems: [{ quantity: "1", price: "1000", taxIds: [] }],
      }),
    });
    expect(neither.status).toBe(400);
  });

  test("auto-created source products inherit the document currency; cross-currency reuse is rejected", async () => {
    const { request } = await buildHarness(createInvoicingKit);
    const clientId = await createClient(request);

    const pesoInvoice = await (
      await request("/api/bills/invoices", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          clientId,
          issueDate: "2025-01-01",
          currency: "DOP",
          lineItems: [
            {
              source: { type: "experience", id: "77", name: "Peso Tour" },
              quantity: "1",
              price: "150000",
              taxIds: [],
            },
          ],
        }),
      })
    ).json();
    expect(pesoInvoice.document.currency).toBe("dop");
    expect(pesoInvoice.document.lineItems[0].currency).toBe("dop");

    const productId = pesoInvoice.document.lineItems[0].productId;
    const product = await (await request(`/api/bills/products/${productId}`)).json();
    expect(product.currency).toBe("dop");

    // Selling the same source in a USD document must fail: one product, one currency.
    const mismatch = await request("/api/bills/invoices", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        clientId,
        issueDate: "2025-02-01",
        currency: "USD",
        lineItems: [
          {
            source: { type: "experience", id: "77", name: "Peso Tour" },
            quantity: "1",
            price: "5000",
            taxIds: [],
          },
        ],
      }),
    });
    expect(mismatch.status).toBe(422);
    expect(await mismatch.text()).toContain("LINE_ITEM_CURRENCY_MISMATCH");
  });
});
