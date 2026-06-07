import type { Repositories } from "./adapters/types";
import type { BetterAuthLike } from "./auth/middleware";

export interface InvoiceIssuedContext {
  organizationId: string;
  invoiceId: string;
}
export interface PaymentSucceededContext {
  organizationId: string;
  paymentId: string;
}
export interface VendorBillRecordedContext {
  organizationId: string;
  vendorBillId: string;
}
export interface VendorBillPaymentSucceededContext {
  organizationId: string;
  vendorBillPaymentId: string;
}

/**
 * Lifecycle hooks. Fired AFTER the originating repo transaction commits, and
 * wrapped by the kit in try/catch so a handler error never fails the invoice or
 * payment operation. Handlers may be async; the kit awaits them but swallows
 * (logs) rejections.
 */
export interface InvoicingKitHooks {
  onInvoiceIssued?: (ctx: InvoiceIssuedContext) => void | Promise<void>;
  onPaymentSucceeded?: (ctx: PaymentSucceededContext) => void | Promise<void>;
  onVendorBillRecorded?: (ctx: VendorBillRecordedContext) => void | Promise<void>;
  onVendorBillPaymentSucceeded?: (
    ctx: VendorBillPaymentSucceededContext,
  ) => void | Promise<void>;
}

export interface InvoicingKitConfig {
  /** Repository bundle. Use `prismaAdapter(prisma)` or your own implementation. */
  adapter: Repositories;
  /** better-auth instance. Must have the organization plugin enabled. */
  auth: BetterAuthLike;
  /** Mount path for the router. Default: "/api/bills". */
  basePath?: string;
  /** Optional post-commit lifecycle hooks. */
  hooks?: InvoicingKitHooks;
}
