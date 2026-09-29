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
  bulkDeleteInvoicesBody,
  bulkResultResponse,
  voidInvoiceBody,
} from "./validation";
import { invoiceToResponse } from "./mappers";
import { noteResponse } from "../notes/validation";
import { noteToResponse } from "../notes/mappers";
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
        422: { description: "Exchange rate required, not applicable or frozen; or an invalid line item" },
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
      method: "post",
      path: "/invoices/bulk-delete",
      tags: ["Invoices"],
      request: { body: { content: { "application/json": { schema: bulkDeleteInvoicesBody } } } },
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
        422: { description: "Exchange rate required, not applicable or frozen; or an invalid line item" },
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
      method: "post",
      path: "/invoices/{id}/issue",
      tags: ["Invoices"],
      request: { params: z.object({ id: z.string() }) },
      responses: {
        200: {
          content: { "application/json": { schema: invoiceResponse } },
          description: "Issued",
        },
        404: { description: "Not found" },
        409: { description: "Invoice is not a draft" },
      },
    }),
    async (c) => {
      const { id } = c.req.valid("param");
      const invoice = await service.issue(id, c.var.authContext);
      return c.json(invoiceToResponse(invoice));
    },
  );

  app.openapi(
    createRoute({
      method: "post",
      path: "/invoices/{id}/void",
      tags: ["Invoices"],
      request: {
        params: z.object({ id: z.string() }),
        body: { content: { "application/json": { schema: voidInvoiceBody } } },
      },
      responses: {
        200: {
          content: { "application/json": { schema: z.object({ invoice: invoiceResponse, creditNote: noteResponse }) } },
          description: "Invoice voided and full credit note issued",
        },
        404: { description: "Invoice not found" },
        409: { description: "Invoice cannot be voided" },
      },
    }),
    async (c) => {
      const { id } = c.req.valid("param");
      const body = c.req.valid("json");
      const result = await service.void(id, body, c.var.authContext);
      return c.json({ invoice: invoiceToResponse(result.invoice), creditNote: noteToResponse(result.creditNote) });
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
