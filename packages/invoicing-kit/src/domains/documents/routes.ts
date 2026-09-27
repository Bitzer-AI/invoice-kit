import { createRoute, OpenAPIHono } from "@hono/zod-openapi";
import { authMiddleware, type BetterAuthLike } from "../../auth/middleware";
import type { AuthVariables } from "../../auth/types";
import type { DocumentCalculationService } from "./service";
import { calculateDocumentBody, calculateDocumentResponse } from "./validation";

export function buildDocumentsRouter(service: DocumentCalculationService, auth: BetterAuthLike) {
  const app = new OpenAPIHono<{ Variables: AuthVariables }>();
  app.use("*", authMiddleware(auth));
  app.openapi(
    createRoute({
      method: "post",
      path: "/documents/calculate",
      tags: ["Documents"],
      request: { body: { content: { "application/json": { schema: calculateDocumentBody } } } },
      responses: {
        200: { content: { "application/json": { schema: calculateDocumentResponse } }, description: "Calculated" },
        401: { description: "Unauthorized" },
        422: { description: "Exchange rate not applicable" },
      },
    }),
    async (c) => c.json(await service.calculate(c.req.valid("json"), c.var.authContext)),
  );
  return app;
}
