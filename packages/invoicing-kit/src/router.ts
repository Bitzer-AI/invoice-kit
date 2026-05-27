import { OpenAPIHono } from "@hono/zod-openapi";
import type { Services } from "./services";
import type { BetterAuthLike } from "./auth/middleware";
import { buildClientsRouter } from "./domains/clients/routes";
import { buildProductsRouter } from "./domains/products/routes";
import { buildTaxesRouter } from "./domains/taxes/routes";

interface BuildRouterArgs {
  services: Services;
  auth: BetterAuthLike;
  basePath: string;
}

export function buildRouter({ services, auth, basePath }: BuildRouterArgs) {
  const root = new OpenAPIHono();
  root.route(basePath, buildClientsRouter(services.clients, auth));
  root.route(basePath, buildProductsRouter(services.products, auth));
  root.route(basePath, buildTaxesRouter(services.taxes, auth));
  return root;
}
