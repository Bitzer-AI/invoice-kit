import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi";
import { authMiddleware, type BetterAuthLike } from "../../auth/middleware";
import type { VendorBillPaymentService } from "./service";
import {
  createVendorBillPaymentBody,
  vendorBillPaymentResponse,
  vendorBillPaymentListResponse,
} from "./validation";
import { vendorBillPaymentToResponse } from "./mappers";
import type { AuthVariables } from "../../auth/types";

export function buildVendorBillPaymentsRouter(
  service: VendorBillPaymentService,
  auth: BetterAuthLike,
) {
  const app = new OpenAPIHono<{ Variables: AuthVariables }>();
  app.use("*", authMiddleware(auth));

  app.openapi(
    createRoute({
      method: "post",
      path: "/vendor-bills/{vendorBillId}/payments",
      tags: ["Vendor Bill Payments"],
      request: {
        params: z.object({ vendorBillId: z.string() }),
        body: { content: { "application/json": { schema: createVendorBillPaymentBody } } },
      },
      responses: {
        201: { content: { "application/json": { schema: vendorBillPaymentResponse } }, description: "Recorded" },
        400: { description: "Amount exceeds bill total" },
        404: { description: "Vendor bill not found" },
      },
    }),
    async (c) => {
      const { vendorBillId } = c.req.valid("param");
      const body = c.req.valid("json");
      const payment = await service.recordManualVendorBillPayment(vendorBillId, body, c.var.authContext);
      return c.json(vendorBillPaymentToResponse(payment), 201);
    },
  );

  app.openapi(
    createRoute({
      method: "get",
      path: "/vendor-bills/{vendorBillId}/payments",
      tags: ["Vendor Bill Payments"],
      request: { params: z.object({ vendorBillId: z.string() }) },
      responses: {
        200: { content: { "application/json": { schema: vendorBillPaymentListResponse } }, description: "List" },
      },
    }),
    async (c) => {
      const { vendorBillId } = c.req.valid("param");
      const result = await service.listForBill(vendorBillId, c.var.authContext);
      const items = Array.isArray(result) ? result : result.data;
      return c.json({ data: items.map(vendorBillPaymentToResponse) });
    },
  );

  app.openapi(
    createRoute({
      method: "get",
      path: "/vendor-bill-payments/{id}",
      tags: ["Vendor Bill Payments"],
      request: { params: z.object({ id: z.string() }) },
      responses: {
        200: { content: { "application/json": { schema: vendorBillPaymentResponse } }, description: "Found" },
        404: { description: "Not found" },
      },
    }),
    async (c) => {
      const { id } = c.req.valid("param");
      const payment = await service.findById(id, c.var.authContext);
      return c.json(vendorBillPaymentToResponse(payment));
    },
  );

  app.openapi(
    createRoute({
      method: "delete",
      path: "/vendor-bill-payments/{id}",
      tags: ["Vendor Bill Payments"],
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
