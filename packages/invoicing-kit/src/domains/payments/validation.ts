import { z } from "zod";
import { PaymentStatus } from "../../types";
import { currencyCodeSchema } from "../../lib/currency";

export const createPaymentBody = z.object({
  paymentMethodId: z.string().optional().nullable(),
  amount: z.string().regex(/^\d+$/, "Amount must be integer minor units"),
  currency: currencyCodeSchema,
  provider: z.string().min(1).max(50),
  paidAt: z.string().datetime().optional().nullable(),
  reference: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
});
export type CreatePaymentBody = z.infer<typeof createPaymentBody>;

export const paymentResponse = z.object({
  id: z.string(),
  invoiceId: z.string(),
  paymentMethodId: z.string().nullable(),
  amount: z.string(),
  currency: z.string(),
  status: z.nativeEnum(PaymentStatus),
  provider: z.string(),
  paidAt: z.string().nullable(),
  reference: z.string().nullable(),
  notes: z.string().nullable(),
  createdAt: z.string(),
});
export type PaymentResponse = z.infer<typeof paymentResponse>;

export const paymentListResponse = z.object({
  data: z.array(paymentResponse),
});
export type PaymentListResponse = z.infer<typeof paymentListResponse>;
