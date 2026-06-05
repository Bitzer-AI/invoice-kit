import { z } from "zod";

export const createPaymentMethodBody = z.object({
  name: z.string().min(1).max(100),
  type: z.string().min(1).max(50),
  instructions: z.string().optional().nullable(),
  metadata: z.unknown().optional().nullable(),
  isActive: z.boolean().optional(),
  isDefault: z.boolean().optional(),
});
export type CreatePaymentMethodBody = z.infer<typeof createPaymentMethodBody>;

export const updatePaymentMethodBody = createPaymentMethodBody.partial();
export type UpdatePaymentMethodBody = z.infer<typeof updatePaymentMethodBody>;

export const listPaymentMethodsQuery = z.object({
  isActive: z.enum(["true", "false"]).optional(),
});
export type ListPaymentMethodsQuery = z.infer<typeof listPaymentMethodsQuery>;

export const paymentMethodResponse = z.object({
  id: z.string(),
  name: z.string(),
  type: z.string(),
  instructions: z.string().nullable(),
  metadata: z.unknown().nullable(),
  isActive: z.boolean(),
  isDefault: z.boolean(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type PaymentMethodResponse = z.infer<typeof paymentMethodResponse>;

export const paymentMethodListResponse = z.object({
  data: z.array(paymentMethodResponse),
});
export type PaymentMethodListResponse = z.infer<typeof paymentMethodListResponse>;
