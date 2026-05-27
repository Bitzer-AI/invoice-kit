import { test, expect, describe } from "vitest";
import { buildHarness } from "./harness";
import { createInvoicingKit } from "../../src/create";

describe("payment-methods integration", () => {
  test("POST /payment-methods creates a payment method with metadata round-trip", async () => {
    const { request } = await buildHarness(createInvoicingKit);
    const metadata = { stripeAccountId: "acct_abc", custom: true };
    const res = await request("/api/bills/payment-methods", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "Stripe",
        type: "STRIPE",
        instructions: "Please wire to our Stripe account",
        metadata,
      }),
    });
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.name).toBe("Stripe");
    expect(body.type).toBe("STRIPE");
    expect(body.instructions).toBe("Please wire to our Stripe account");
    expect(body.metadata).toEqual(metadata);
    expect(body.id).toBeTruthy();
  });

  test("POST /payment-methods with isDefault=true clears isDefault on others", async () => {
    const { request } = await buildHarness(createInvoicingKit);

    // Create payment method A with isDefault=true
    const resA = await request("/api/bills/payment-methods", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "Method A",
        type: "STRIPE",
        isDefault: true,
      }),
    });
    const pmA = await resA.json();
    expect(pmA.isDefault).toBe(true);

    // Create payment method B with isDefault=true
    const resB = await request("/api/bills/payment-methods", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "Method B",
        type: "MANUAL",
        isDefault: true,
      }),
    });
    const pmB = await resB.json();
    expect(pmB.isDefault).toBe(true);

    // Get all payment methods - only B should be default
    const listRes = await request("/api/bills/payment-methods");
    const list = await listRes.json();
    const methods = list.data;

    const updatedA = methods.find((m) => m.id === pmA.id);
    const updatedB = methods.find((m) => m.id === pmB.id);

    expect(updatedA.isDefault).toBe(false);
    expect(updatedB.isDefault).toBe(true);
  });

  test("GET /payment-methods?isActive=true filters", async () => {
    const { request } = await buildHarness(createInvoicingKit);

    // Create active payment method
    await request("/api/bills/payment-methods", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "Active Method",
        type: "STRIPE",
        isActive: true,
      }),
    });

    // Create inactive payment method
    await request("/api/bills/payment-methods", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "Inactive Method",
        type: "MANUAL",
        isActive: false,
      }),
    });

    // List only active
    const res = await request("/api/bills/payment-methods?isActive=true");
    const body = await res.json();
    expect(body.data.every((m) => m.isActive)).toBe(true);
  });

  test("PATCH /payment-methods/{id} setting isDefault=true clears others", async () => {
    const { request } = await buildHarness(createInvoicingKit);

    // Create two payment methods
    const res1 = await request("/api/bills/payment-methods", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "First",
        type: "STRIPE",
        isDefault: true,
      }),
    });
    const pm1 = await res1.json();

    const res2 = await request("/api/bills/payment-methods", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "Second",
        type: "MANUAL",
      }),
    });
    const pm2 = await res2.json();

    // Update pm2 to be default
    const updateRes = await request(`/api/bills/payment-methods/${pm2.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isDefault: true }),
    });
    const updated = await updateRes.json();
    expect(updated.isDefault).toBe(true);

    // Verify pm1 is no longer default
    const listRes = await request("/api/bills/payment-methods");
    const list = await listRes.json();
    const updatedPm1 = list.data.find((m) => m.id === pm1.id);
    expect(updatedPm1.isDefault).toBe(false);
  });

  test("DELETE /payment-methods/{id} returns 204", async () => {
    const { request } = await buildHarness(createInvoicingKit);
    const create = await request("/api/bills/payment-methods", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "Delete me",
        type: "STRIPE",
      }),
    });
    const pm = await create.json();

    const res = await request(`/api/bills/payment-methods/${pm.id}`, { method: "DELETE" });
    expect(res.status).toBe(204);

    const after = await request(`/api/bills/payment-methods/${pm.id}`);
    expect(after.status).toBe(404);
  });

  test("GET /payment-methods/{id} returns 404 for missing", async () => {
    const { request } = await buildHarness(createInvoicingKit);
    const res = await request("/api/bills/payment-methods/missing");
    expect(res.status).toBe(404);
  });
});
