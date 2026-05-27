import { test, expect, describe } from "vitest";
import { buildHarness } from "./harness";
import { createInvoicingKit } from "../../src/create";

describe("taxes integration", () => {
  test("POST /taxes creates a tax", async () => {
    const { request } = await buildHarness(createInvoicingKit);
    const res = await request("/api/bills/taxes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "VAT",
        type: "PERCENTAGE",
        rate: "21.00",
        description: "Value Added Tax",
      }),
    });
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.name).toBe("VAT");
    expect(body.type).toBe("PERCENTAGE");
    expect(body.description).toBe("Value Added Tax");
    expect(body.id).toBeTruthy();
  });

  test("POST /taxes with isDefault=true clears isDefault on other taxes", async () => {
    const { request } = await buildHarness(createInvoicingKit);

    // Create tax A with isDefault=true
    const resA = await request("/api/bills/taxes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "Tax A",
        type: "PERCENTAGE",
        rate: "10.00",
        isDefault: true,
      }),
    });
    const taxA = await resA.json();
    expect(taxA.isDefault).toBe(true);

    // Create tax B with isDefault=true
    const resB = await request("/api/bills/taxes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "Tax B",
        type: "PERCENTAGE",
        rate: "20.00",
        isDefault: true,
      }),
    });
    const taxB = await resB.json();
    expect(taxB.isDefault).toBe(true);

    // Get all taxes - only B should be default
    const listRes = await request("/api/bills/taxes");
    const list = await listRes.json();
    const taxes = list.data;

    const updatedA = taxes.find((t) => t.id === taxA.id);
    const updatedB = taxes.find((t) => t.id === taxB.id);

    expect(updatedA.isDefault).toBe(false);
    expect(updatedB.isDefault).toBe(true);
  });

  test("GET /taxes?isActive=true filters", async () => {
    const { request } = await buildHarness(createInvoicingKit);

    // Create active tax
    await request("/api/bills/taxes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "Active Tax",
        type: "PERCENTAGE",
        rate: "15.00",
        isActive: true,
      }),
    });

    // Create inactive tax
    await request("/api/bills/taxes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "Inactive Tax",
        type: "PERCENTAGE",
        rate: "5.00",
        isActive: false,
      }),
    });

    // List only active
    const res = await request("/api/bills/taxes?isActive=true");
    const body = await res.json();
    expect(body.data.every((t) => t.isActive)).toBe(true);
  });

  test("PATCH /taxes/{id} setting isDefault=true clears others", async () => {
    const { request } = await buildHarness(createInvoicingKit);

    // Create two taxes
    const res1 = await request("/api/bills/taxes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "First",
        type: "PERCENTAGE",
        rate: "10.00",
        isDefault: true,
      }),
    });
    const tax1 = await res1.json();

    const res2 = await request("/api/bills/taxes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "Second",
        type: "PERCENTAGE",
        rate: "20.00",
      }),
    });
    const tax2 = await res2.json();

    // Update tax2 to be default
    const updateRes = await request(`/api/bills/taxes/${tax2.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isDefault: true }),
    });
    const updated = await updateRes.json();
    expect(updated.isDefault).toBe(true);

    // Verify tax1 is no longer default
    const listRes = await request("/api/bills/taxes");
    const list = await listRes.json();
    const updatedTax1 = list.data.find((t) => t.id === tax1.id);
    expect(updatedTax1.isDefault).toBe(false);
  });

  test("DELETE /taxes/{id} returns 204", async () => {
    const { request } = await buildHarness(createInvoicingKit);
    const create = await request("/api/bills/taxes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "Delete me",
        type: "PERCENTAGE",
        rate: "10.00",
      }),
    });
    const tax = await create.json();

    const res = await request(`/api/bills/taxes/${tax.id}`, { method: "DELETE" });
    expect(res.status).toBe(204);

    const after = await request(`/api/bills/taxes/${tax.id}`);
    expect(after.status).toBe(404);
  });

  test("GET /taxes/{id} returns 404 for missing", async () => {
    const { request } = await buildHarness(createInvoicingKit);
    const res = await request("/api/bills/taxes/missing");
    expect(res.status).toBe(404);
  });
});
