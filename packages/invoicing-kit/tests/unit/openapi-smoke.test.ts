import { test, expect, describe } from "vitest";
import { createInvoicingKit } from "../../src/create";
import { inMemoryAdapter } from "../../src/adapters/memory";
import type { BetterAuthLike } from "../../src/auth/middleware";

const stubAuth: BetterAuthLike = {
  api: {
    async getSession() {
      return { user: { id: "u" }, session: { activeOrganizationId: "o" } };
    },
  },
} as BetterAuthLike;

describe("OpenAPI document", () => {
  test("generates with nativeEnum-backed schemas across all domains", () => {
    const { router } = createInvoicingKit({ adapter: inMemoryAdapter(), auth: stubAuth });
    const doc = (router as any).getOpenAPIDocument({
      openapi: "3.0.0",
      info: { title: "invoicing-kit", version: "0.0.0" },
    });
    expect(doc.paths).toBeTruthy();
    expect(Object.keys(doc.paths).length).toBeGreaterThan(0);
  });
});
