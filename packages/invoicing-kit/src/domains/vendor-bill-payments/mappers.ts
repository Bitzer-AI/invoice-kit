import type { VendorBillPayment } from "../../types";
import type { VendorBillPaymentResponse } from "./validation";

export function vendorBillPaymentToResponse(p: VendorBillPayment): VendorBillPaymentResponse {
  return {
    id: p.id,
    vendorBillId: p.vendorBillId,
    paymentMethodId: p.paymentMethodId,
    amount: p.amount.toString(),
    currency: p.currency,
    status: p.status,
    provider: p.provider,
    paidAt: p.paidAt ? p.paidAt.toISOString() : null,
    reference: p.reference,
    notes: p.notes,
    createdAt: p.createdAt.toISOString(),
  };
}
