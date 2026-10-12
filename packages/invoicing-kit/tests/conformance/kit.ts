import type { z } from "zod";
import type { Repositories } from "../../src/adapters/types";
import type { AuthContext } from "../../src/auth/types";
import { createInvoicingKit } from "../../src/create";
import { stubAuth } from "../support/stub-auth";
import { seed } from "./seed";

const BASE_PATH = "/api/bills";

export type SeededKit = Awaited<ReturnType<typeof seededKit>>;

export async function seededKit(repos: Repositories) {
  const { organizationId, userId } = await seed(repos);
  const kit = createInvoicingKit({
    adapter: repos,
    auth: stubAuth({ user: { id: userId }, session: { activeOrganizationId: organizationId } }),
    basePath: BASE_PATH,
  });
  const ctx: AuthContext = { userId, organizationId, role: null };
  const send = (method: string, path: string, body?: unknown) =>
    kit.router.request(`${BASE_PATH}${path}`, {
      method,
      headers: { "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  return {
    repos,
    services: kit.services,
    ctx,
    organizationId,
    get: (path: string) => send("GET", path),
    post: (path: string, body: unknown) => send("POST", path, body),
    patch: (path: string, body: unknown) => send("PATCH", path, body),
  };
}

export async function parsedBody<Schema extends z.ZodType>(response: Response, schema: Schema): Promise<z.infer<Schema>> {
  return schema.parse(await response.json());
}
