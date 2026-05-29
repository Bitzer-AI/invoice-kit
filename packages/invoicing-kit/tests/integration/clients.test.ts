import { test, expect, describe } from "vitest";
import { buildHarness } from "./harness";
import { createInvoicingKit } from "../../src/create";

describe("clients integration", () => {
  test("POST /clients creates a client", async () => {
    const { request } = await buildHarness(createInvoicingKit);
    const res = await request("/api/bills/clients", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Acme Co", email: "billing@acme.test" }),
    });
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body).toMatchObject({ name: "Acme Co", email: "billing@acme.test" });
    expect(body.id).toBeTruthy();
  });

  test("GET /clients/{id} returns the client", async () => {
    const { request } = await buildHarness(createInvoicingKit);
    const create = await request("/api/bills/clients", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Get me" }),
    });
    const created = await create.json();
    const res = await request(`/api/bills/clients/${created.id}`);
    expect(res.status).toBe(200);
    expect((await res.json()).name).toBe("Get me");
  });

  test("GET /clients/{id} returns 404 for missing", async () => {
    const { request } = await buildHarness(createInvoicingKit);
    const res = await request("/api/bills/clients/missing");
    expect(res.status).toBe(404);
  });

  test("GET /clients lists with pagination", async () => {
    const { request } = await buildHarness(createInvoicingKit);
    for (let i = 0; i < 3; i++) {
      await request("/api/bills/clients", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: `C${i}` }),
      });
    }
    const res = await request("/api/bills/clients?perPage=2&page=1");
    const body = await res.json();
    expect(body.data).toHaveLength(2);
    expect(body.pageInfo.totalCount).toBe(3);
  });

  test("PATCH /clients/{id} updates fields", async () => {
    const { request } = await buildHarness(createInvoicingKit);
    const c = await (
      await request("/api/bills/clients", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "Old" }),
      })
    ).json();
    const res = await request(`/api/bills/clients/${c.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "New" }),
    });
    expect(res.status).toBe(200);
    expect((await res.json()).name).toBe("New");
  });

  test("POST /clients forwards taxId and taxIdType", async () => {
    const { request } = await buildHarness(createInvoicingKit);
    const res = await request("/api/bills/clients", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Negocio SRL", taxId: "130862346", taxIdType: "RNC" }),
    });
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.taxId).toBe("130862346");
    expect(body.taxIdType).toBe("RNC");
  });

  test("DELETE /clients/{id} returns 204", async () => {
    const { request } = await buildHarness(createInvoicingKit);
    const c = await (
      await request("/api/bills/clients", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "Bye" }),
      })
    ).json();
    const res = await request(`/api/bills/clients/${c.id}`, { method: "DELETE" });
    expect(res.status).toBe(204);
    const after = await request(`/api/bills/clients/${c.id}`);
    expect(after.status).toBe(404);
  });
});
