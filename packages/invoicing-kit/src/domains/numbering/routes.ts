import { createRoute, OpenAPIHono } from "@hono/zod-openapi";
import { authMiddleware, type BetterAuthLike } from "../../auth/middleware";
import type { AuthVariables } from "../../auth/types";
import type { NumberingService } from "./service";
import { getSequenceQuery, upsertSequenceBody, sequenceResponse } from "./validation";

export function buildNumberingRouter(service: NumberingService, auth: BetterAuthLike) {
  const app = new OpenAPIHono<{ Variables: AuthVariables }>();
  app.use("*", authMiddleware(auth));

  app.openapi(
    createRoute({
      method: "get",
      path: "/document-number-sequence",
      tags: ["Numbering"],
      request: { query: getSequenceQuery },
      responses: {
        200: { content: { "application/json": { schema: sequenceResponse } }, description: "Sequence" },
        401: { description: "Unauthorized" },
      },
    }),
    async (c) => {
      const { documentType } = c.req.valid("query");
      return c.json(await service.get(documentType, c.var.authContext));
    },
  );

  app.openapi(
    createRoute({
      method: "post",
      path: "/document-number-sequence",
      tags: ["Numbering"],
      request: { body: { content: { "application/json": { schema: upsertSequenceBody } } } },
      responses: {
        200: { content: { "application/json": { schema: sequenceResponse } }, description: "Upserted" },
        400: { description: "Validation error" },
        401: { description: "Unauthorized" },
      },
    }),
    async (c) => {
      const body = c.req.valid("json");
      return c.json(await service.upsert(body, c.var.authContext));
    },
  );

  return app;
}
