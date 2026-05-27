import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi";
import { authMiddleware, type BetterAuthLike } from "../../auth/middleware";
import type { PaymentService } from "./service";
import {
  createPaymentBody,
  paymentResponse,
  paymentListResponse,
} from "./validation";
import { paymentToResponse } from "./mappers";
import type { AuthVariables } from "../../auth/types";

export function buildPaymentsRouter(service: PaymentService, auth: BetterAuthLike) {
  const app = new OpenAPIHono<{ Variables: AuthVariables }>();
  app.use("*", authMiddleware(auth));

  app.openapi(
    createRoute({
      method: "post",
      path: "/invoices/{invoiceId}/payments",
      tags: ["Payments"],
      request: {
        params: z.object({ invoiceId: z.string() }),
        body: { content: { "application/json": { schema: createPaymentBody } } },
      },
      responses: {
        201: { content: { "application/json": { schema: paymentResponse } }, description: "Recorded" },
        400: { description: "Amount exceeds invoice total" },
        404: { description: "Invoice not found" },
      },
    }),
    async (c) => {
      const { invoiceId } = c.req.valid("param");
      const body = c.req.valid("json");
      const payment = await service.recordManualPayment(invoiceId, body, c.var.authContext);
      return c.json(paymentToResponse(payment), 201);
    },
  );

  app.openapi(
    createRoute({
      method: "get",
      path: "/invoices/{invoiceId}/payments",
      tags: ["Payments"],
      request: { params: z.object({ invoiceId: z.string() }) },
      responses: {
        200: { content: { "application/json": { schema: paymentListResponse } }, description: "List" },
      },
    }),
    async (c) => {
      const { invoiceId } = c.req.valid("param");
      const result = await service.listForInvoice(invoiceId, c.var.authContext);
      const items = Array.isArray(result) ? result : result.data;
      return c.json({ data: items.map(paymentToResponse) });
    },
  );

  app.openapi(
    createRoute({
      method: "get",
      path: "/payments/{id}",
      tags: ["Payments"],
      request: { params: z.object({ id: z.string() }) },
      responses: {
        200: { content: { "application/json": { schema: paymentResponse } }, description: "Found" },
        404: { description: "Not found" },
      },
    }),
    async (c) => {
      const { id } = c.req.valid("param");
      const payment = await service.findById(id, c.var.authContext);
      return c.json(paymentToResponse(payment));
    },
  );

  app.openapi(
    createRoute({
      method: "delete",
      path: "/payments/{id}",
      tags: ["Payments"],
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
