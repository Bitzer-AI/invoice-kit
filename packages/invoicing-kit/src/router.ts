import { OpenAPIHono } from "@hono/zod-openapi";
import type { Services } from "./services";
import type { BetterAuthLike } from "./auth/middleware";
import { buildClientsRouter } from "./domains/clients/routes";
import { buildVendorsRouter } from "./domains/vendors/routes";
import { buildProductsRouter } from "./domains/products/routes";
import { buildTaxesRouter } from "./domains/taxes/routes";
import { buildPaymentMethodsRouter } from "./domains/payment-methods/routes";
import { buildQuotesRouter } from "./domains/quotes/routes";
import { buildInvoicesRouter } from "./domains/invoices/routes";
import { buildVendorBillsRouter } from "./domains/vendor-bills/routes";
import { buildPaymentsRouter } from "./domains/payments/routes";
import { buildVendorBillPaymentsRouter } from "./domains/vendor-bill-payments/routes";
import { buildNumberingRouter } from "./domains/numbering/routes";

interface BuildRouterArgs {
  services: Services;
  auth: BetterAuthLike;
  basePath: string;
}

export function buildRouter({ services, auth, basePath }: BuildRouterArgs) {
  const root = new OpenAPIHono();
  root.route(basePath, buildClientsRouter(services.clients, auth));
  root.route(basePath, buildVendorsRouter(services.vendors, auth));
  root.route(basePath, buildProductsRouter(services.products, auth));
  root.route(basePath, buildTaxesRouter(services.taxes, auth));
  root.route(basePath, buildPaymentMethodsRouter(services.paymentMethods, auth));
  root.route(basePath, buildQuotesRouter(services.quotes, auth));
  root.route(basePath, buildInvoicesRouter(services.invoices, auth));
  root.route(basePath, buildVendorBillsRouter(services.vendorBills, auth));
  root.route(basePath, buildPaymentsRouter(services.payments, auth));
  root.route(basePath, buildVendorBillPaymentsRouter(services.vendorBillPayments, auth));
  root.route(basePath, buildNumberingRouter(services.numbering, auth));
  return root;
}
