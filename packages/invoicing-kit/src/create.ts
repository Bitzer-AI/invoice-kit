import type { InvoicingKitConfig } from "./config";
import { buildServices } from "./services";
import { buildRouter } from "./router";

export function createInvoicingKit(config: InvoicingKitConfig) {
  const repos = config.adapter;
  const services = buildServices(repos, config.hooks);
  const router = buildRouter({
    services,
    auth: config.auth,
    basePath: config.basePath ?? "/api/bills",
  });
  return { router, services, repos };
}
