import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi";
import { authMiddleware, type BetterAuthLike } from "../../auth/middleware";
import type { QuoteService } from "./service";
import {
  quoteListResponse,
  quoteResponse,
  createQuoteBody,
  listQuotesQuery,
  updateQuoteBody,
  bulkDeleteQuotesBody,
  bulkUpdateQuoteStatusBody,
  bulkResultResponse,
} from "./validation";
import { quoteToResponse } from "./mappers";
import type { AuthVariables } from "../../auth/types";

export function buildQuotesRouter(service: QuoteService, auth: BetterAuthLike) {
  const app = new OpenAPIHono<{ Variables: AuthVariables }>();
  app.use("*", authMiddleware(auth));

  app.openapi(
    createRoute({
      method: "post",
      path: "/quotes",
      tags: ["Quotes"],
      request: { body: { content: { "application/json": { schema: createQuoteBody } } } },
      responses: {
        201: { content: { "application/json": { schema: quoteResponse } }, description: "Created" },
        401: { description: "Unauthorized" },
      },
    }),
    async (c) => {
      const body = c.req.valid("json");
      const created = await service.create(body, c.var.authContext);
      const full = await service.findById(created.id, c.var.authContext);
      return c.json(quoteToResponse(full), 201);
    },
  );

  app.openapi(
    createRoute({
      method: "get",
      path: "/quotes",
      tags: ["Quotes"],
      request: { query: listQuotesQuery },
      responses: {
        200: { content: { "application/json": { schema: quoteListResponse } }, description: "List" },
      },
    }),
    async (c) => {
      const query = c.req.valid("query");
      const page = await service.list(query, c.var.authContext);
      return c.json({
        data: page.data.map(quoteToResponse),
        pageInfo: page.pageInfo,
      });
    },
  );

  app.openapi(
    createRoute({
      method: "post",
      path: "/quotes/bulk-delete",
      tags: ["Quotes"],
      request: { body: { content: { "application/json": { schema: bulkDeleteQuotesBody } } } },
      responses: {
        200: {
          content: { "application/json": { schema: bulkResultResponse } },
          description: "Deleted",
        },
        401: { description: "Unauthorized" },
      },
    }),
    async (c) => {
      const { ids } = c.req.valid("json");
      const result = await service.bulkDelete(ids, c.var.authContext);
      return c.json(result);
    },
  );

  app.openapi(
    createRoute({
      method: "post",
      path: "/quotes/bulk-status",
      tags: ["Quotes"],
      request: {
        body: { content: { "application/json": { schema: bulkUpdateQuoteStatusBody } } },
      },
      responses: {
        200: {
          content: { "application/json": { schema: bulkResultResponse } },
          description: "Updated",
        },
        401: { description: "Unauthorized" },
      },
    }),
    async (c) => {
      const { ids, status } = c.req.valid("json");
      const result = await service.bulkUpdateStatus(ids, status, c.var.authContext);
      return c.json(result);
    },
  );

  app.openapi(
    createRoute({
      method: "get",
      path: "/quotes/{id}",
      tags: ["Quotes"],
      request: { params: z.object({ id: z.string() }) },
      responses: {
        200: { content: { "application/json": { schema: quoteResponse } }, description: "Found" },
        404: { description: "Not found" },
      },
    }),
    async (c) => {
      const { id } = c.req.valid("param");
      const quote = await service.findById(id, c.var.authContext);
      return c.json(quoteToResponse(quote));
    },
  );

  app.openapi(
    createRoute({
      method: "patch",
      path: "/quotes/{id}",
      tags: ["Quotes"],
      request: {
        params: z.object({ id: z.string() }),
        body: { content: { "application/json": { schema: updateQuoteBody } } },
      },
      responses: {
        200: { content: { "application/json": { schema: quoteResponse } }, description: "Updated" },
        404: { description: "Not found" },
      },
    }),
    async (c) => {
      const { id } = c.req.valid("param");
      const body = c.req.valid("json");
      await service.update(id, body, c.var.authContext);
      const full = await service.findById(id, c.var.authContext);
      return c.json(quoteToResponse(full));
    },
  );

  app.openapi(
    createRoute({
      method: "delete",
      path: "/quotes/{id}",
      tags: ["Quotes"],
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
