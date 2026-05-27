import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi";
import { authMiddleware, type BetterAuthLike } from "../../auth/middleware";
import type { ProductService } from "./service";
import {
  productListResponse,
  productResponse,
  createProductBody,
  listProductsQuery,
  updateProductBody,
} from "./validation";
import { productToResponse } from "./mappers";
import type { AuthVariables } from "../../auth/types";

export function buildProductsRouter(service: ProductService, auth: BetterAuthLike) {
  const app = new OpenAPIHono<{ Variables: AuthVariables }>();
  app.use("*", authMiddleware(auth));

  app.openapi(
    createRoute({
      method: "post",
      path: "/products",
      tags: ["Products"],
      request: { body: { content: { "application/json": { schema: createProductBody } } } },
      responses: {
        201: { content: { "application/json": { schema: productResponse } }, description: "Created" },
        401: { description: "Unauthorized" },
      },
    }),
    async (c) => {
      const body = c.req.valid("json");
      const created = await service.create(body, c.var.authContext);
      return c.json(productToResponse(created), 201);
    },
  );

  app.openapi(
    createRoute({
      method: "get",
      path: "/products",
      tags: ["Products"],
      request: { query: listProductsQuery },
      responses: {
        200: { content: { "application/json": { schema: productListResponse } }, description: "List" },
      },
    }),
    async (c) => {
      const query = c.req.valid("query");
      const page = await service.list(query, c.var.authContext);
      return c.json({
        data: page.data.map(productToResponse),
        pageInfo: page.pageInfo,
      });
    },
  );

  app.openapi(
    createRoute({
      method: "get",
      path: "/products/{id}",
      tags: ["Products"],
      request: { params: z.object({ id: z.string() }) },
      responses: {
        200: { content: { "application/json": { schema: productResponse } }, description: "Found" },
        404: { description: "Not found" },
      },
    }),
    async (c) => {
      const { id } = c.req.valid("param");
      const product = await service.findById(id, c.var.authContext);
      return c.json(productToResponse(product));
    },
  );

  app.openapi(
    createRoute({
      method: "patch",
      path: "/products/{id}",
      tags: ["Products"],
      request: {
        params: z.object({ id: z.string() }),
        body: { content: { "application/json": { schema: updateProductBody } } },
      },
      responses: {
        200: { content: { "application/json": { schema: productResponse } }, description: "Updated" },
        404: { description: "Not found" },
      },
    }),
    async (c) => {
      const { id } = c.req.valid("param");
      const body = c.req.valid("json");
      const updated = await service.update(id, body, c.var.authContext);
      return c.json(productToResponse(updated));
    },
  );

  app.openapi(
    createRoute({
      method: "delete",
      path: "/products/{id}",
      tags: ["Products"],
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
