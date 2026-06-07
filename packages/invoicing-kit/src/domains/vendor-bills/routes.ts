import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi";
import { authMiddleware, type BetterAuthLike } from "../../auth/middleware";
import type { VendorBillService } from "./service";
import {
  createVendorBillBody,
  updateVendorBillBody,
  listVendorBillsQuery,
  vendorBillResponse,
  vendorBillListResponse,
} from "./validation";
import { vendorBillToResponse } from "./mappers";
import type { AuthVariables } from "../../auth/types";

export function buildVendorBillsRouter(service: VendorBillService, auth: BetterAuthLike) {
  const app = new OpenAPIHono<{ Variables: AuthVariables }>();
  app.use("*", authMiddleware(auth));

  app.openapi(
    createRoute({
      method: "post",
      path: "/vendor-bills",
      tags: ["Vendor Bills"],
      request: { body: { content: { "application/json": { schema: createVendorBillBody } } } },
      responses: {
        201: { content: { "application/json": { schema: vendorBillResponse } }, description: "Created" },
        400: { description: "Invalid party / validation" },
        404: { description: "Vendor not found" },
      },
    }),
    async (c) => {
      const body = c.req.valid("json");
      const created = await service.create(body, c.var.authContext);
      const full = await service.findById(created.id, c.var.authContext);
      return c.json(vendorBillToResponse(full), 201);
    },
  );

  app.openapi(
    createRoute({
      method: "get",
      path: "/vendor-bills",
      tags: ["Vendor Bills"],
      request: { query: listVendorBillsQuery },
      responses: {
        200: { content: { "application/json": { schema: vendorBillListResponse } }, description: "List" },
      },
    }),
    async (c) => {
      const query = c.req.valid("query");
      const page = await service.list(query, c.var.authContext);
      return c.json({ data: page.data.map(vendorBillToResponse), pageInfo: page.pageInfo });
    },
  );

  app.openapi(
    createRoute({
      method: "get",
      path: "/vendor-bills/{id}",
      tags: ["Vendor Bills"],
      request: { params: z.object({ id: z.string() }) },
      responses: {
        200: { content: { "application/json": { schema: vendorBillResponse } }, description: "Found" },
        404: { description: "Not found" },
      },
    }),
    async (c) => {
      const { id } = c.req.valid("param");
      const bill = await service.findById(id, c.var.authContext);
      return c.json(vendorBillToResponse(bill));
    },
  );

  app.openapi(
    createRoute({
      method: "patch",
      path: "/vendor-bills/{id}",
      tags: ["Vendor Bills"],
      request: {
        params: z.object({ id: z.string() }),
        body: { content: { "application/json": { schema: updateVendorBillBody } } },
      },
      responses: {
        200: { content: { "application/json": { schema: vendorBillResponse } }, description: "Updated" },
        404: { description: "Not found" },
      },
    }),
    async (c) => {
      const { id } = c.req.valid("param");
      const body = c.req.valid("json");
      await service.update(id, body, c.var.authContext);
      const full = await service.findById(id, c.var.authContext);
      return c.json(vendorBillToResponse(full));
    },
  );

  app.openapi(
    createRoute({
      method: "delete",
      path: "/vendor-bills/{id}",
      tags: ["Vendor Bills"],
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
