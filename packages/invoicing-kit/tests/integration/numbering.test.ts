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

    const after = await request("/api/bills/document-number-sequence?documentType=INVOICE");
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

  test("POST rejects nextNumber at/below the max already issued (guard)", async () => {
    const { request } = await buildHarness(createInvoicingKit);
    const { clientId, productId } = await createPrereqs(request);

    // 1) configure INVOICE to start at 1000 with prefix FAC-
    await request("/api/bills/document-number-sequence", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ documentType: "INVOICE", prefix: "FAC-", nextNumber: 1000 }),
    });

    // 2) issue an invoice WITHOUT documentNumberPrefix → assigns number 1000,
    //    prefix defaults server-side to "FAC-"
    const created = await request("/api/bills/invoices", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        clientId,
        issueDate: "2025-01-01",
        lineItems: [{ productId, quantity: "1", price: "10000", taxIds: [] }],
      }),
    });
    expect(created.status).toBe(201);
    const createdBody = await created.json();
    expect(createdBody.document.documentNumberPrefix).toBe("FAC-");
    expect(createdBody.document.documentNumber).toBe(1000);

    // 3) trying to set nextNumber back to <= the max issued (1000) is rejected
    const bad = await request("/api/bills/document-number-sequence", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ documentType: "INVOICE", nextNumber: 1000 }),
    });
    expect(bad.status).toBe(400);
  });
});
