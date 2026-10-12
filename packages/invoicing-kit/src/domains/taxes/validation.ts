import { z } from "zod";
import { TaxType } from "../../types";
import { TAX_RATE_PRECISION, TAX_RATE_SCALE } from "../../lib/money/decimal";

const TAX_RATE_INTEGER_DIGITS = TAX_RATE_PRECISION - TAX_RATE_SCALE;
const TAX_RATE_PATTERN = new RegExp(`^\\d{1,${TAX_RATE_INTEGER_DIGITS}}(\\.\\d{1,${TAX_RATE_SCALE}})?$`);
const FISCAL_CATEGORY_MAX_LENGTH = 40;

const rateSchema = z
  .string()
  .regex(
    TAX_RATE_PATTERN,
    `A rate has at most ${TAX_RATE_INTEGER_DIGITS} integer digits and ${TAX_RATE_SCALE} decimals`,
  )
  .describe(
    `PERCENTAGE: a fraction with at most ${TAX_RATE_SCALE} decimals. "0.18" means 18% and "0.08875" means 8.875%. A value of 1 or more is refused. FIXED: minor units per unit of quantity. "50" means 50 minor units.`,
  );

const baseTaxBody = z.object({
  name: z.string().min(1).max(100),
  description: z.string().optional().nullable(),
  type: z.nativeEnum(TaxType),
  rate: rateSchema,
  isActive: z.boolean().optional(),
  isDefault: z.boolean().optional(),
  fiscalCategory: z.string().trim().min(1).max(FISCAL_CATEGORY_MAX_LENGTH).optional().nullable(),
});

// A PERCENTAGE rate is a fraction (0.1800 = 18%), so a value >= 1 is almost certainly a
// whole-percent mistake (e.g. "18" → 1800%) that would silently corrupt invoice totals.
// FIXED rates are minor units and legitimately >= 1, so they are exempt.
const percentageRateIsFraction = (data: { type?: string; rate?: string }): boolean =>
  !(data.type === TaxType.Percentage && data.rate != null && Number(data.rate) >= 1);
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
  type: z.nativeEnum(TaxType),
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
