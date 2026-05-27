import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi";
import { authMiddleware, type BetterAuthLike } from "../../auth/middleware";
import type { TaxService } from "./service";
import {
  taxListResponse,
  taxResponse,
  createTaxBody,
  listTaxesQuery,
  updateTaxBody,
} from "./validation";
import { taxToResponse } from "./mappers";
import type { AuthVariables } from "../../auth/types";

export function buildTaxesRouter(service: TaxService, auth: BetterAuthLike) {
  const app = new OpenAPIHono<{ Variables: AuthVariables }>();
  app.use("*", authMiddleware(auth));

  app.openapi(
    createRoute({
      method: "post",
      path: "/taxes",
      tags: ["Taxes"],
      request: { body: { content: { "application/json": { schema: createTaxBody } } } },
      responses: {
        201: { content: { "application/json": { schema: taxResponse } }, description: "Created" },
        401: { description: "Unauthorized" },
      },
    }),
    async (c) => {
      const body = c.req.valid("json");
      const created = await service.create(body, c.var.authContext);
      return c.json(taxToResponse(created), 201);
    },
  );

  app.openapi(
    createRoute({
      method: "get",
      path: "/taxes",
      tags: ["Taxes"],
      request: { query: listTaxesQuery },
      responses: {
        200: { content: { "application/json": { schema: taxListResponse } }, description: "List" },
      },
    }),
    async (c) => {
      const query = c.req.valid("query");
      const result = await service.list(query, c.var.authContext);
      return c.json({ data: result.map(taxToResponse) });
    },
  );

  app.openapi(
    createRoute({
      method: "get",
      path: "/taxes/{id}",
      tags: ["Taxes"],
      request: { params: z.object({ id: z.string() }) },
      responses: {
        200: { content: { "application/json": { schema: taxResponse } }, description: "Found" },
        404: { description: "Not found" },
      },
    }),
    async (c) => {
      const { id } = c.req.valid("param");
      const tax = await service.findById(id, c.var.authContext);
      return c.json(taxToResponse(tax));
    },
  );

  app.openapi(
    createRoute({
      method: "patch",
      path: "/taxes/{id}",
      tags: ["Taxes"],
      request: {
        params: z.object({ id: z.string() }),
        body: { content: { "application/json": { schema: updateTaxBody } } },
      },
      responses: {
        200: { content: { "application/json": { schema: taxResponse } }, description: "Updated" },
        404: { description: "Not found" },
      },
    }),
    async (c) => {
      const { id } = c.req.valid("param");
      const body = c.req.valid("json");
      const updated = await service.update(id, body, c.var.authContext);
      return c.json(taxToResponse(updated));
    },
  );

  app.openapi(
    createRoute({
      method: "delete",
      path: "/taxes/{id}",
      tags: ["Taxes"],
      request: { params: z.object({ id: z.string() }) },
      responses: {
        204: { description: "Deleted" },
        404: { description: "Not found" },
      },
    }),
    async (c) => {
      const { id } = c.req.valid("param");
      await service.delete(id, c.var.authContext);
      return c.body(null, 204);
    },
  );

  return app;
}
