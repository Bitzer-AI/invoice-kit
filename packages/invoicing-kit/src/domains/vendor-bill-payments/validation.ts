import { z } from "zod";
import { currencyCodeSchema } from "../../lib/currency";

export const createVendorBillPaymentBody = z.object({
  paymentMethodId: z.string().optional().nullable(),
  amount: z.string().regex(/^\d+$/, "Amount must be integer minor units"),
  currency: currencyCodeSchema,
  provider: z.string().min(1).max(50),
  paidAt: z.string().datetime().optional().nullable(),
  reference: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
});
export type CreateVendorBillPaymentBody = z.infer<typeof createVendorBillPaymentBody>;

export const vendorBillPaymentResponse = z.object({
  id: z.string(),
  vendorBillId: z.string(),
  paymentMethodId: z.string().nullable(),
  amount: z.string(),
  currency: z.string(),
  status: z.enum(["succeeded", "failed", "canceled"]),
  provider: z.string(),
  paidAt: z.string().nullable(),
  reference: z.string().nullable(),
  notes: z.string().nullable(),
  createdAt: z.string(),
});
export type VendorBillPaymentResponse = z.infer<typeof vendorBillPaymentResponse>;

export const vendorBillPaymentListResponse = z.object({
  data: z.array(vendorBillPaymentResponse),
});
export type VendorBillPaymentListResponse = z.infer<typeof vendorBillPaymentListResponse>;
