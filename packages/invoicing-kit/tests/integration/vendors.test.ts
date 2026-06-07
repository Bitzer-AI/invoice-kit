import { test, expect, describe } from "vitest";
import { buildHarness } from "./harness";
import { createInvoicingKit } from "../../src/create";

describe("vendors integration", () => {
  test("POST /vendors creates a vendor with taxId/taxIdType", async () => {
    const { request } = await buildHarness(createInvoicingKit);
    const res = await request("/api/bills/vendors", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Guia Pedro", taxId: "00112345678", taxIdType: "CEDULA" }),
    });
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body).toMatchObject({ name: "Guia Pedro", taxId: "00112345678", taxIdType: "CEDULA", isActive: true });
    expect(body.id).toBeTruthy();
  });

  test("GET /vendors/{id} returns 404 for missing", async () => {
    const { request } = await buildHarness(createInvoicingKit);
    const res = await request("/api/bills/vendors/missing");
    expect(res.status).toBe(404);
  });

  test("GET /vendors lists with pagination", async () => {
    const { request } = await buildHarness(createInvoicingKit);
    for (let i = 0; i < 3; i++) {
      await request("/api/bills/vendors", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: `V${i}` }),
      });
    }
    const res = await request("/api/bills/vendors?perPage=2&page=1");
    const body = await res.json();
    expect(body.data).toHaveLength(2);
    expect(body.pageInfo.totalCount).toBe(3);
  });

  test("PATCH /vendors/{id} updates name + isActive", async () => {
    const { request } = await buildHarness(createInvoicingKit);
    const v = await (
      await request("/api/bills/vendors", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "Old" }),
      })
    ).json();
    const res = await request(`/api/bills/vendors/${v.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "New", isActive: false }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.name).toBe("New");
    expect(body.isActive).toBe(false);
  });

  test("DELETE /vendors/{id} returns 204", async () => {
    const { request } = await buildHarness(createInvoicingKit);
    const v = await (
      await request("/api/bills/vendors", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "Bye" }),
      })
    ).json();
    const res = await request(`/api/bills/vendors/${v.id}`, { method: "DELETE" });
    expect(res.status).toBe(204);
    expect((await request(`/api/bills/vendors/${v.id}`)).status).toBe(404);
  });
});
