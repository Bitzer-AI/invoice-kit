import { test, expect, describe } from "vitest";
import { buildHarness } from "./harness";
import { createInvoicingKit } from "../../src/create";

describe("products integration", () => {
  test("POST /products creates a product", async () => {
    const { request } = await buildHarness(createInvoicingKit);
    const res = await request("/api/bills/products", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Widget", description: "A useful widget", price: "150.00" }),
    });
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body).toMatchObject({ name: "Widget", description: "A useful widget", price: "150.00" });
    expect(body.id).toBeTruthy();
  });

  test("GET /products/{id} returns the product", async () => {
    const { request } = await buildHarness(createInvoicingKit);
    const create = await request("/api/bills/products", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Get me", price: "99.99" }),
    });
    const created = await create.json();
    const res = await request(`/api/bills/products/${created.id}`);
    expect(res.status).toBe(200);
    expect((await res.json()).name).toBe("Get me");
  });

  test("GET /products/{id} returns 404 for missing", async () => {
    const { request } = await buildHarness(createInvoicingKit);
    const res = await request("/api/bills/products/missing");
    expect(res.status).toBe(404);
  });

  test("GET /products lists with pagination", async () => {
    const { request } = await buildHarness(createInvoicingKit);
    for (let i = 0; i < 3; i++) {
      await request("/api/bills/products", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: `P${i}`, price: "25.00" }),
      });
    }
    const res = await request("/api/bills/products?perPage=2&page=1");
    const body = await res.json();
    expect(body.data).toHaveLength(2);
    expect(body.pageInfo.totalCount).toBe(3);
  });

  test("PATCH /products/{id} updates fields", async () => {
    const { request } = await buildHarness(createInvoicingKit);
    const p = await (
      await request("/api/bills/products", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "Old", price: "50.00" }),
      })
    ).json();
    const res = await request(`/api/bills/products/${p.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "New", price: "75.00" }),
    });
    expect(res.status).toBe(200);
    expect((await res.json()).name).toBe("New");
  });

  test("DELETE /products/{id} returns 204", async () => {
    const { request } = await buildHarness(createInvoicingKit);
    const p = await (
      await request("/api/bills/products", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "Bye", price: "100.00" }),
      })
    ).json();
    const res = await request(`/api/bills/products/${p.id}`, { method: "DELETE" });
    expect(res.status).toBe(204);
    const after = await request(`/api/bills/products/${p.id}`);
    expect(after.status).toBe(404);
  });
});
