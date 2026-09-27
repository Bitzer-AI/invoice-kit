import { z } from "zod";
import { currencyCodeSchema } from "../../lib/currency";
import { exchangeRateSchema } from "../../lib/exchange";
import { ExchangeRateSource } from "../../types";

export const calculateDocumentBody = z.object({
  currency: currencyCodeSchema.optional(),
  issueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  exchangeRate: exchangeRateSchema.optional().nullable(),
  lineItems: z
    .array(
      z.object({
        quantity: z.string().regex(/^\d+(\.\d{1,4})?$/, "Invalid quantity"),
        price: z.string().regex(/^\d+$/, "Price must be integer minor units"),
        taxIds: z.array(z.string()).default([]),
      }),
    )
    .min(1)
    .max(500),
});
export type CalculateDocumentBody = z.infer<typeof calculateDocumentBody>;

const totals = z.object({ subtotal: z.string(), tax: z.string(), total: z.string() });

export const calculateDocumentResponse = z.object({
  currency: z.string(),
  subtotal: z.string(),
  tax: z.string(),
  total: z.string(),
  lines: z.array(
    z.object({ subtotal: z.string(), taxAmount: z.string(), total: z.string(), baseSubtotal: z.string().nullable() }),
  ),
  taxTotals: z.array(z.object({ taxId: z.string(), amount: z.string(), baseAmount: z.string().nullable() })),
  exchange: z
    .object({
      baseCurrency: z.string(),
      rate: z.string(),
      rateDate: z.string().nullable(),
      source: z.nativeEnum(ExchangeRateSource),
    })
    .nullable(),
  base: totals.nullable(),
});
export type CalculateDocumentResponse = z.infer<typeof calculateDocumentResponse>;
