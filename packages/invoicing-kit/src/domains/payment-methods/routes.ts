import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi";
import { authMiddleware, type BetterAuthLike } from "../../auth/middleware";
import type { PaymentMethodService } from "./service";
import {
  paymentMethodListResponse,
  paymentMethodResponse,
  createPaymentMethodBody,
  listPaymentMethodsQuery,
  updatePaymentMethodBody,
} from "./validation";
import { paymentMethodToResponse } from "./mappers";
import type { AuthVariables } from "../../auth/types";

export function buildPaymentMethodsRouter(service: PaymentMethodService, auth: BetterAuthLike) {
  const app = new OpenAPIHono<{ Variables: AuthVariables }>();
  app.use("*", authMiddleware(auth));

  app.openapi(
    createRoute({
      method: "post",
      path: "/payment-methods",
      tags: ["Payment Methods"],
      request: { body: { content: { "application/json": { schema: createPaymentMethodBody } } } },
      responses: {
        201: { content: { "application/json": { schema: paymentMethodResponse } }, description: "Created" },
        401: { description: "Unauthorized" },
      },
    }),
    async (c) => {
      const body = c.req.valid("json");
      const created = await service.create(body, c.var.authContext);
      return c.json(paymentMethodToResponse(created), 201);
    },
  );

  app.openapi(
    createRoute({
      method: "get",
      path: "/payment-methods",
      tags: ["Payment Methods"],
      request: { query: listPaymentMethodsQuery },
      responses: {
        200: { content: { "application/json": { schema: paymentMethodListResponse } }, description: "List" },
      },
    }),
    async (c) => {
      const query = c.req.valid("query");
      const result = await service.list(query, c.var.authContext);
      return c.json({ data: result.map(paymentMethodToResponse) });
    },
  );

  app.openapi(
    createRoute({
      method: "get",
      path: "/payment-methods/{id}",
      tags: ["Payment Methods"],
      request: { params: z.object({ id: z.string() }) },
      responses: {
        200: { content: { "application/json": { schema: paymentMethodResponse } }, description: "Found" },
        404: { description: "Not found" },
      },
    }),
    async (c) => {
      const { id } = c.req.valid("param");
      const paymentMethod = await service.findById(id, c.var.authContext);
      return c.json(paymentMethodToResponse(paymentMethod));
    },
  );

  app.openapi(
    createRoute({
      method: "patch",
      path: "/payment-methods/{id}",
      tags: ["Payment Methods"],
      request: {
        params: z.object({ id: z.string() }),
        body: { content: { "application/json": { schema: updatePaymentMethodBody } } },
      },
      responses: {
        200: { content: { "application/json": { schema: paymentMethodResponse } }, description: "Updated" },
        404: { description: "Not found" },
      },
    }),
    async (c) => {
      const { id } = c.req.valid("param");
      const body = c.req.valid("json");
      const updated = await service.update(id, body, c.var.authContext);
      return c.json(paymentMethodToResponse(updated));
    },
  );

  app.openapi(
    createRoute({
      method: "delete",
      path: "/payment-methods/{id}",
      tags: ["Payment Methods"],
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
