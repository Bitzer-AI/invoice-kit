import { z } from "zod";

const rateSchema = z.string().regex(/^\d+(\.\d{1,4})?$/, "Invalid decimal rate");

export const createTaxBody = z.object({
  name: z.string().min(1).max(100),
  description: z.string().optional().nullable(),
  type: z.enum(["PERCENTAGE", "FIXED"]),
  rate: rateSchema,
  isActive: z.boolean().optional(),
  isDefault: z.boolean().optional(),
});
export type CreateTaxBody = z.infer<typeof createTaxBody>;

export const updateTaxBody = createTaxBody.partial();
export type UpdateTaxBody = z.infer<typeof updateTaxBody>;

export const listTaxesQuery = z.object({
  isActive: z.enum(["true", "false"]).optional(),
});
export type ListTaxesQuery = z.infer<typeof listTaxesQuery>;

export const taxResponse = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string().nullable(),
  type: z.enum(["PERCENTAGE", "FIXED"]),
  rate: z.string(),
  isActive: z.boolean(),
  isDefault: z.boolean(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type TaxResponse = z.infer<typeof taxResponse>;

export const taxListResponse = z.object({
  data: z.array(taxResponse),
});
export type TaxListResponse = z.infer<typeof taxListResponse>;
