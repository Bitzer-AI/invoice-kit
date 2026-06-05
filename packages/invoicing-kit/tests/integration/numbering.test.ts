import { test, expect, describe } from "vitest";
import { buildHarness } from "./harness";
import { createInvoicingKit } from "../../src/create";

async function createPrereqs(request: (input: string, init?: RequestInit) => Promise<Response>) {
  const client = await (
    await request("/api/bills/clients", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Numbering Client" }),
    })
  ).json();

  const product = await (
    await request("/api/bills/products", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Widget", price: "100.00" }),
    })
  ).json();

  return { clientId: client.id as string, productId: product.id as string };
}

describe("numbering integration", () => {
  test("GET suggests nextNumber=1 when empty, POST upserts, GET reflects it", async () => {
    const { request } = await buildHarness(createInvoicingKit);

    const empty = await request("/api/bills/document-number-sequence?documentType=INVOICE");
    expect(empty.status).toBe(200);
    expect(await empty.json()).toMatchObject({
      documentType: "INVOICE",
      prefix: null,
      nextNumber: 1,
      padWidth: null,
    });

    const up = await request("/api/bills/document-number-sequence", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ documentType: "INVOICE", prefix: "FAC-", nextNumber: 1000, padWidth: 6 }),
    });
    expect(up.status).toBe(200);
    expect(await up.json()).toMatchObject({ prefix: "FAC-", nextNumber: 1000, padWidth: 6 });

    const after = await request(
      "/api/bills/document-number-sequence?documentType=INVOICE&prefix=FAC-",
    );
    expect(await after.json()).toMatchObject({ prefix: "FAC-", nextNumber: 1000, padWidth: 6 });
  });

  test("INVOICE and QUOTE are independent", async () => {
    const { request } = await buildHarness(createInvoicingKit);
    await request("/api/bills/document-number-sequence", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ documentType: "QUOTE", prefix: "COT-", nextNumber: 5, padWidth: 4 }),
    });
    const inv = await request("/api/bills/document-number-sequence?documentType=INVOICE");
    expect(await inv.json()).toMatchObject({ prefix: null, nextNumber: 1 });
  });

  test("series B01 and B02 are independent", async () => {
    const { request } = await buildHarness(createInvoicingKit);
    const { clientId, productId } = await createPrereqs(request);

    const issue = (prefix: string) =>
      request("/api/bills/invoices", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          clientId,
          documentNumberPrefix: prefix,
          issueDate: "2025-01-01",
          lineItems: [{ productId, quantity: "1", price: "10000", taxIds: [] }],
        }),
      });

    const b01a = await (await issue("B01")).json();
    const b02a = await (await issue("B02")).json();
    const b01b = await (await issue("B01")).json();

    expect(b01a.document).toMatchObject({ documentNumberPrefix: "B01", documentNumber: 1 });
    expect(b02a.document).toMatchObject({ documentNumberPrefix: "B02", documentNumber: 1 });
    expect(b01b.document).toMatchObject({ documentNumberPrefix: "B01", documentNumber: 2 });
  });

  test("list returns all configured series for a type, excluding other types", async () => {
    const { request } = await buildHarness(createInvoicingKit);

    for (const prefix of ["B01", "B02"]) {
      await request("/api/bills/document-number-sequence", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ documentType: "INVOICE", prefix, nextNumber: 1 }),
      });
    }
    await request("/api/bills/document-number-sequence", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ documentType: "QUOTE", prefix: "COT", nextNumber: 1 }),
    });

    const res = await request("/api/bills/document-number-sequences?documentType=INVOICE");
    expect(res.status).toBe(200);
    const list = await res.json();
    expect(list.map((s: { prefix: string }) => s.prefix).sort()).toEqual(["B01", "B02"]);
  });

  test("POST guard is per-series: rejects nextNumber at/below that series' max issued", async () => {
    const { request } = await buildHarness(createInvoicingKit);
    const { clientId, productId } = await createPrereqs(request);

    // 1) configure INVOICE series B01 to start at 1000
    await request("/api/bills/document-number-sequence", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ documentType: "INVOICE", prefix: "B01", nextNumber: 1000 }),
    });

    // 2) issue an invoice on series B01 → assigns number 1000
    const created = await request("/api/bills/invoices", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        clientId,
        documentNumberPrefix: "B01",
        issueDate: "2025-01-01",
        lineItems: [{ productId, quantity: "1", price: "10000", taxIds: [] }],
      }),
    });
    expect(created.status).toBe(201);
    const createdBody = await created.json();
    expect(createdBody.document.documentNumberPrefix).toBe("B01");
    expect(createdBody.document.documentNumber).toBe(1000);

    // 3) setting B01's nextNumber back to <= its max issued (1000) is rejected
    const bad = await request("/api/bills/document-number-sequence", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ documentType: "INVOICE", prefix: "B01", nextNumber: 1000 }),
    });
    expect(bad.status).toBe(400);

    // 4) but a different series (B02) is unaffected by B01's max
    const otherSeries = await request("/api/bills/document-number-sequence", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ documentType: "INVOICE", prefix: "B02", nextNumber: 1 }),
    });
    expect(otherSeries.status).toBe(200);
  });
});
