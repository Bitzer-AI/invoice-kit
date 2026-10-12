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

  test("declares 422 on the document writes that validate money and exchange rates", () => {
    const { router } = createInvoicingKit({ adapter: inMemoryAdapter(), auth: stubAuth });
    const doc = (router as any).getOpenAPIDocument({ openapi: "3.0.0", info: { title: "invoicing-kit", version: "0.0.0" } });
    const operation = (suffix: string, method: string) => {
      const path = Object.keys(doc.paths).find((candidate) => candidate.endsWith(suffix));
      return path ? doc.paths[path][method] : undefined;
    };
    const writes: Array<[string, string]> = [
      ["/invoices", "post"],
      ["/invoices/{id}", "patch"],
      ["/vendor-bills", "post"],
      ["/vendor-bills/{id}", "patch"],
      ["/notes", "post"],
      ["/notes/{id}", "patch"],
      ["/quotes", "post"],
      ["/quotes/{id}", "patch"],
      ["/documents/calculate", "post"],
    ];
    for (const [suffix, method] of writes) {
      expect(operation(suffix, method)?.responses?.["422"], `${method} ${suffix}`).toBeTruthy();
    }
  });

  test("the void body requires the credit note series and takes no other field", () => {
    const { router } = createInvoicingKit({ adapter: inMemoryAdapter(), auth: stubAuth });
    const doc = (router as any).getOpenAPI31Document({ openapi: "3.1.0", info: { title: "invoicing-kit", version: "0.0.0" } });
    const path = Object.keys(doc.paths).find((candidate) => candidate.endsWith("/invoices/{id}/void"));
    const operation = doc.paths[path!].post;
    const body = operation.requestBody.content["application/json"].schema;

    expect(body.required).toEqual(["reason", "documentNumberPrefix"]);
    expect(body.additionalProperties).toBe(false);
    expect(body.properties.documentNumberPrefix).toMatchObject({ type: ["string", "null"], minLength: 1, maxLength: 20 });
    expect(Object.keys(operation.responses)).toEqual(["200", "400", "404", "409"]);
  });

  test("a product write declares the 422 of a price with too many decimals", () => {
    const { router } = createInvoicingKit({ adapter: inMemoryAdapter(), auth: stubAuth });
    const doc = (router as any).getOpenAPIDocument({ openapi: "3.0.0", info: { title: "invoicing-kit", version: "0.0.0" } });
    const path = (suffix: string) => Object.keys(doc.paths).find((candidate) => candidate.endsWith(suffix))!;

    expect(doc.paths[path("/products")].post.responses["422"]).toBeTruthy();
    expect(doc.paths[path("/products/{id}")].patch.responses["422"]).toBeTruthy();
  });
});
