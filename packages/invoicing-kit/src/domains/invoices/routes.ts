import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi";
import { authMiddleware, type BetterAuthLike } from "../../auth/middleware";
import type { InvoiceService } from "./service";
import {
  invoiceListResponse,
  invoiceResponse,
  createInvoiceBody,
  listInvoicesQuery,
  updateInvoiceBody,
  convertFromQuoteBody,
} from "./validation";
import { invoiceToResponse } from "./mappers";
import type { AuthVariables } from "../../auth/types";

export function buildInvoicesRouter(service: InvoiceService, auth: BetterAuthLike) {
  const app = new OpenAPIHono<{ Variables: AuthVariables }>();
  app.use("*", authMiddleware(auth));

  app.openapi(
    createRoute({
      method: "post",
      path: "/invoices",
      tags: ["Invoices"],
      request: { body: { content: { "application/json": { schema: createInvoiceBody } } } },
      responses: {
        201: {
          content: { "application/json": { schema: invoiceResponse } },
          description: "Created",
        },
        401: { description: "Unauthorized" },
      },
    }),
    async (c) => {
      const body = c.req.valid("json");
      const created = await service.create(body, c.var.authContext);
      const full = await service.findById(created.id, c.var.authContext);
      return c.json(invoiceToResponse(full), 201);
    },
  );

  app.openapi(
    createRoute({
      method: "get",
      path: "/invoices",
      tags: ["Invoices"],
      request: { query: listInvoicesQuery },
      responses: {
        200: {
          content: { "application/json": { schema: invoiceListResponse } },
          description: "List",
        },
      },
    }),
    async (c) => {
      const query = c.req.valid("query");
      const page = await service.list(query, c.var.authContext);
      return c.json({
        data: page.data.map(invoiceToResponse),
        pageInfo: page.pageInfo,
      });
    },
  );

  app.openapi(
    createRoute({
      method: "get",
      path: "/invoices/{id}",
      tags: ["Invoices"],
      request: { params: z.object({ id: z.string() }) },
      responses: {
        200: {
          content: { "application/json": { schema: invoiceResponse } },
          description: "Found",
        },
        404: { description: "Not found" },
      },
    }),
    async (c) => {
      const { id } = c.req.valid("param");
      const invoice = await service.findById(id, c.var.authContext);
      return c.json(invoiceToResponse(invoice));
    },
  );

  app.openapi(
    createRoute({
      method: "patch",
      path: "/invoices/{id}",
      tags: ["Invoices"],
      request: {
        params: z.object({ id: z.string() }),
        body: { content: { "application/json": { schema: updateInvoiceBody } } },
      },
      responses: {
        200: {
          content: { "application/json": { schema: invoiceResponse } },
          description: "Updated",
        },
        404: { description: "Not found" },
      },
    }),
    async (c) => {
      const { id } = c.req.valid("param");
      const body = c.req.valid("json");
      await service.update(id, body, c.var.authContext);
      const full = await service.findById(id, c.var.authContext);
      return c.json(invoiceToResponse(full));
    },
  );

  app.openapi(
    createRoute({
      method: "delete",
      path: "/invoices/{id}",
      tags: ["Invoices"],
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

  app.openapi(
    createRoute({
      method: "post",
      path: "/invoices/from-quote/{quoteId}",
      tags: ["Invoices"],
      request: {
        params: z.object({ quoteId: z.string() }),
        body: { content: { "application/json": { schema: convertFromQuoteBody } } },
      },
      responses: {
        201: {
          content: { "application/json": { schema: invoiceResponse } },
          description: "Created from quote",
        },
        404: { description: "Quote not found" },
        409: { description: "Quote already converted" },
      },
    }),
    async (c) => {
      const { quoteId } = c.req.valid("param");
      const body = c.req.valid("json");
      const created = await service.convertFromQuote(quoteId, body, c.var.authContext);
      const full = await service.findById(created.id, c.var.authContext);
      return c.json(invoiceToResponse(full), 201);
    },
  );

  return app;
}
