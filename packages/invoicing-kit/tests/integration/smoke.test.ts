import { test, expect } from "vitest";
import { Hono } from "hono";
import { buildHarness } from "./harness";

test("harness boots without errors when given a minimal createInvoicingKit", async () => {
  const create = () => ({ router: new Hono() });
  const { app } = await buildHarness(create as any);
  const res = await app.request("/health-stub-doesnt-exist");
  expect(res.status).toBe(404);
});
