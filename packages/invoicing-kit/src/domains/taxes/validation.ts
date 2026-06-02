import { z } from "zod";

const rateSchema = z
  .string()
  .regex(/^\d+(\.\d{1,4})?$/, "Invalid decimal rate")
  .describe(
    'PERCENTAGE: a fraction — "0.1800" means 18% (NOT "18", which is 1800%). FIXED: minor units — "50" means 50 cents.',
  );

const baseTaxBody = z.object({
  name: z.string().min(1).max(100),
  description: z.string().optional().nullable(),
  type: z.enum(["PERCENTAGE", "FIXED"]),
  rate: rateSchema,
  isActive: z.boolean().optional(),
  isDefault: z.boolean().optional(),
  fiscalCategory: z.enum(["ITBIS18", "ITBIS16", "ITBIS0", "EXEMPT"]).optional().nullable(),
});

// A PERCENTAGE rate is a fraction (0.1800 = 18%), so a value >= 1 is almost certainly a
// whole-percent mistake (e.g. "18" → 1800%) that would silently corrupt invoice totals.
// FIXED rates are minor units and legitimately >= 1, so they are exempt.
const percentageRateIsFraction = (data: { type?: string; rate?: string }): boolean =>
  !(data.type === "PERCENTAGE" && data.rate != null && Number(data.rate) >= 1);
const percentageRateIssue = {
  path: ["rate"],
  message:
    'PERCENTAGE rate is a fraction, not a whole percent: use "0.1800" for 18%. A value >= 1 is rejected as a likely mistake (FIXED taxes use minor units and are exempt).',
};

export const createTaxBody = baseTaxBody.refine(percentageRateIsFraction, percentageRateIssue);
export type CreateTaxBody = z.infer<typeof createTaxBody>;

export const updateTaxBody = baseTaxBody.partial().refine(percentageRateIsFraction, percentageRateIssue);
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
  fiscalCategory: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type TaxResponse = z.infer<typeof taxResponse>;

export const taxListResponse = z.object({
  data: z.array(taxResponse),
});
export type TaxListResponse = z.infer<typeof taxListResponse>;
