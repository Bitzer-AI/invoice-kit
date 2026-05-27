import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi";
import { authMiddleware, type BetterAuthLike } from "../../auth/middleware";
import type { ClientService } from "./service";
import {
  clientListResponse,
  clientResponse,
  createClientBody,
  listClientsQuery,
  updateClientBody,
} from "./validation";
import { clientToResponse } from "./mappers";
import type { AuthVariables } from "../../auth/types";

export function buildClientsRouter(service: ClientService, auth: BetterAuthLike) {
  const app = new OpenAPIHono<{ Variables: AuthVariables }>();
  app.use("*", authMiddleware(auth));

  app.openapi(
    createRoute({
      method: "post",
      path: "/clients",
      tags: ["Clients"],
      request: { body: { content: { "application/json": { schema: createClientBody } } } },
      responses: {
        201: { content: { "application/json": { schema: clientResponse } }, description: "Created" },
        401: { description: "Unauthorized" },
      },
    }),
    async (c) => {
      const body = c.req.valid("json");
      const created = await service.create(body, c.var.authContext);
      return c.json(clientToResponse(created), 201);
    },
  );

  app.openapi(
    createRoute({
      method: "get",
      path: "/clients",
      tags: ["Clients"],
      request: { query: listClientsQuery },
      responses: {
        200: { content: { "application/json": { schema: clientListResponse } }, description: "List" },
      },
    }),
    async (c) => {
      const query = c.req.valid("query");
      const page = await service.list(query, c.var.authContext);
      return c.json({
        data: page.data.map(clientToResponse),
        pageInfo: page.pageInfo,
      });
    },
  );

  app.openapi(
    createRoute({
      method: "get",
      path: "/clients/{id}",
      tags: ["Clients"],
      request: { params: z.object({ id: z.string() }) },
      responses: {
        200: { content: { "application/json": { schema: clientResponse } }, description: "Found" },
        404: { description: "Not found" },
      },
    }),
    async (c) => {
      const { id } = c.req.valid("param");
      const client = await service.findById(id, c.var.authContext);
      return c.json(clientToResponse(client));
    },
  );

  app.openapi(
    createRoute({
      method: "patch",
      path: "/clients/{id}",
      tags: ["Clients"],
      request: {
        params: z.object({ id: z.string() }),
        body: { content: { "application/json": { schema: updateClientBody } } },
      },
      responses: {
        200: { content: { "application/json": { schema: clientResponse } }, description: "Updated" },
        404: { description: "Not found" },
      },
    }),
    async (c) => {
      const { id } = c.req.valid("param");
      const body = c.req.valid("json");
      const updated = await service.update(id, body, c.var.authContext);
      return c.json(clientToResponse(updated));
    },
  );

  app.openapi(
    createRoute({
      method: "delete",
      path: "/clients/{id}",
      tags: ["Clients"],
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
