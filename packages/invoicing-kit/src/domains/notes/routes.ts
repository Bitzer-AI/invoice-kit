import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi";
import { authMiddleware, type BetterAuthLike } from "../../auth/middleware";
import type { NoteService } from "./service";
import {
  createNoteBody,
  updateNoteBody,
  listNotesQuery,
  noteResponse,
  noteListResponse,
} from "./validation";
import { noteToResponse } from "./mappers";
import type { AuthVariables } from "../../auth/types";

export function buildNotesRouter(service: NoteService, auth: BetterAuthLike) {
  const app = new OpenAPIHono<{ Variables: AuthVariables }>();
  app.use("*", authMiddleware(auth));

  app.openapi(
    createRoute({
      method: "post",
      path: "/notes",
      tags: ["Notes"],
      request: { body: { content: { "application/json": { schema: createNoteBody } } } },
      responses: {
        201: { content: { "application/json": { schema: noteResponse } }, description: "Created" },
        400: { description: "Invalid party / validation" },
        404: { description: "Referenced document not found" },
      },
    }),
    async (c) => {
      const body = c.req.valid("json");
      const created = await service.create(body, c.var.authContext);
      const full = await service.findById(created.id, c.var.authContext);
      return c.json(noteToResponse(full), 201);
    },
  );

  app.openapi(
    createRoute({
      method: "get",
      path: "/notes",
      tags: ["Notes"],
      request: { query: listNotesQuery },
      responses: {
        200: { content: { "application/json": { schema: noteListResponse } }, description: "List" },
      },
    }),
    async (c) => {
      const query = c.req.valid("query");
      const page = await service.list(query, c.var.authContext);
      return c.json({ data: page.data.map(noteToResponse), pageInfo: page.pageInfo });
    },
  );

  app.openapi(
    createRoute({
      method: "get",
      path: "/notes/{id}",
      tags: ["Notes"],
      request: { params: z.object({ id: z.string() }) },
      responses: {
        200: { content: { "application/json": { schema: noteResponse } }, description: "Found" },
        404: { description: "Not found" },
      },
    }),
    async (c) => {
      const { id } = c.req.valid("param");
      const note = await service.findById(id, c.var.authContext);
      return c.json(noteToResponse(note));
    },
  );

  app.openapi(
    createRoute({
      method: "patch",
      path: "/notes/{id}",
      tags: ["Notes"],
      request: {
        params: z.object({ id: z.string() }),
        body: { content: { "application/json": { schema: updateNoteBody } } },
      },
      responses: {
        200: { content: { "application/json": { schema: noteResponse } }, description: "Updated" },
        404: { description: "Not found" },
      },
    }),
    async (c) => {
      const { id } = c.req.valid("param");
      const body = c.req.valid("json");
      await service.update(id, body, c.var.authContext);
      const full = await service.findById(id, c.var.authContext);
      return c.json(noteToResponse(full));
    },
  );

  app.openapi(
    createRoute({
      method: "delete",
      path: "/notes/{id}",
      tags: ["Notes"],
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
