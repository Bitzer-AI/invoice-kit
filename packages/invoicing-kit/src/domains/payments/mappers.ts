import type { Payment } from "../../types";
import type { PaymentResponse } from "./validation";

export function paymentToResponse(p: Payment): PaymentResponse {
  return {
    id: p.id,
    invoiceId: p.invoiceId,
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
