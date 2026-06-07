import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi";
import { authMiddleware, type BetterAuthLike } from "../../auth/middleware";
import type { VendorService } from "./service";
import {
  vendorListResponse,
  vendorResponse,
  createVendorBody,
  listVendorsQuery,
  updateVendorBody,
} from "./validation";
import { vendorToResponse } from "./mappers";
import type { AuthVariables } from "../../auth/types";

export function buildVendorsRouter(service: VendorService, auth: BetterAuthLike) {
  const app = new OpenAPIHono<{ Variables: AuthVariables }>();
  app.use("*", authMiddleware(auth));

  app.openapi(
    createRoute({
      method: "post",
      path: "/vendors",
      tags: ["Vendors"],
      request: { body: { content: { "application/json": { schema: createVendorBody } } } },
      responses: {
        201: { content: { "application/json": { schema: vendorResponse } }, description: "Created" },
        401: { description: "Unauthorized" },
      },
    }),
    async (c) => {
      const body = c.req.valid("json");
      const created = await service.create(body, c.var.authContext);
      return c.json(vendorToResponse(created), 201);
    },
  );

  app.openapi(
    createRoute({
      method: "get",
      path: "/vendors",
      tags: ["Vendors"],
      request: { query: listVendorsQuery },
      responses: {
        200: { content: { "application/json": { schema: vendorListResponse } }, description: "List" },
      },
    }),
    async (c) => {
      const query = c.req.valid("query");
      const page = await service.list(query, c.var.authContext);
      return c.json({ data: page.data.map(vendorToResponse), pageInfo: page.pageInfo });
    },
  );

  app.openapi(
    createRoute({
      method: "get",
      path: "/vendors/{id}",
      tags: ["Vendors"],
      request: { params: z.object({ id: z.string() }) },
      responses: {
        200: { content: { "application/json": { schema: vendorResponse } }, description: "Found" },
        404: { description: "Not found" },
      },
    }),
    async (c) => {
      const { id } = c.req.valid("param");
      const vendor = await service.findById(id, c.var.authContext);
      return c.json(vendorToResponse(vendor));
    },
  );

  app.openapi(
    createRoute({
      method: "patch",
      path: "/vendors/{id}",
      tags: ["Vendors"],
      request: {
        params: z.object({ id: z.string() }),
        body: { content: { "application/json": { schema: updateVendorBody } } },
      },
      responses: {
        200: { content: { "application/json": { schema: vendorResponse } }, description: "Updated" },
        404: { description: "Not found" },
      },
    }),
    async (c) => {
      const { id } = c.req.valid("param");
      const body = c.req.valid("json");
      const updated = await service.update(id, body, c.var.authContext);
      return c.json(vendorToResponse(updated));
    },
  );

  app.openapi(
    createRoute({
      method: "delete",
      path: "/vendors/{id}",
      tags: ["Vendors"],
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
