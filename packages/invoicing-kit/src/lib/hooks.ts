import type { InvoicingKitHooks } from "../config";

// Post-commit hook emitters shared by every service that issues or records a
// document. A throwing handler is logged and never fails the operation.

export async function emitInvoiceIssued(
  hooks: InvoicingKitHooks | undefined,
  organizationId: string,
  invoiceId: string,
): Promise<void> {
  if (!hooks?.onInvoiceIssued) return;
  try {
    await hooks.onInvoiceIssued({ organizationId, invoiceId });
  } catch (err) {
    console.error("[invoicing-kit] onInvoiceIssued handler failed", err);
  }
}

export async function emitVendorBillRecorded(
  hooks: InvoicingKitHooks | undefined,
  organizationId: string,
  vendorBillId: string,
): Promise<void> {
  if (!hooks?.onVendorBillRecorded) return;
  try {
    await hooks.onVendorBillRecorded({ organizationId, vendorBillId });
  } catch (err) {
    console.error("[invoicing-kit] onVendorBillRecorded handler failed", err);
  }
}
