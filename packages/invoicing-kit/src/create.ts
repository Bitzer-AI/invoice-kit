import type { InvoicingKitConfig } from "./config";
import { buildServices } from "./services";
import { buildRouter } from "./router";
import { buildMoneySettings } from "./lib/money/settings";

export function createInvoicingKit(config: InvoicingKitConfig) {
  const repos = config.adapter;
  const services = buildServices(repos, config.hooks, buildMoneySettings(config), {
    creditNotePrefix: config.creditNotePrefix ?? null,
    issueGuard: config.issueGuard,
  });
  const router = buildRouter({
    services,
    auth: config.auth,
    basePath: config.basePath ?? "/api/bills",
  });
  return { router, services, repos };
}
