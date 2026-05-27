import { z } from "zod";

const lineItemSchema = z.object({
  productId: z.string(),
  quantity: z.string().regex(/^\d+(\.\d{1,4})?$/, "Invalid quantity"),
  price: z.string().regex(/^\d+$/, "Price must be integer minor units"), // BigInt as string in body
  description: z.string().optional().nullable(),
  taxIds: z.array(z.string()).default([]),
});

export const createQuoteBody = z.object({
  clientId: z.string(),
  documentNumberPrefix: z.string().max(20).optional().nullable(),
  issueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "YYYY-MM-DD"),
  validUntil: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable(),
  notes: z.string().optional().nullable(),
  status: z.enum(["draft", "sent", "accepted", "rejected", "converted"]).default("draft"),
  lineItems: z.array(lineItemSchema).min(1),
  paymentMethodIds: z.array(z.string()).default([]),
});
export type CreateQuoteBody = z.infer<typeof createQuoteBody>;

export const updateQuoteBody = z.object({
  clientId: z.string().optional(),
  documentNumberPrefix: z.string().max(20).optional().nullable(),
  issueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  validUntil: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable(),
  notes: z.string().optional().nullable(),
  status: z.enum(["draft", "sent", "accepted", "rejected", "converted"]).optional(),
  lineItems: z.array(lineItemSchema).min(1).optional(),
  paymentMethodIds: z.array(z.string()).optional(),
});
export type UpdateQuoteBody = z.infer<typeof updateQuoteBody>;

export const listQuotesQuery = z.object({
  page: z.coerce.number().int().positive().optional(),
  perPage: z.coerce.number().int().positive().max(100).optional(),
  status: z.string().optional(), // comma-separated
  clientId: z.string().optional(),
});
export type ListQuotesQuery = z.infer<typeof listQuotesQuery>;

const lineItemResponse = z.object({
  id: z.string(),
  productId: z.string(),
  quantity: z.string(),
  price: z.string(),
  taxAmount: z.string(),
  total: z.string(),
  description: z.string().nullable(),
  taxes: z.array(z.object({ id: z.string(), taxId: z.string(), taxAmount: z.string() })),
});

export const quoteResponse = z.object({
  id: z.string(),
  documentId: z.string(),
  status: z.enum(["draft", "sent", "accepted", "rejected", "converted"]),
  validUntil: z.string().nullable(),
  document: z.object({
    clientId: z.string(),
    documentNumberPrefix: z.string().nullable(),
    documentNumber: z.number().int(),
    issueDate: z.string(),
    dueDate: z.string().nullable(),
    notes: z.string().nullable(),
    subtotal: z.string().nullable(),
    tax: z.string().nullable(),
    total: z.string().nullable(),
    lineItems: z.array(lineItemResponse),
  }),
});
export type QuoteResponse = z.infer<typeof quoteResponse>;

export const quoteListResponse = z.object({
  data: z.array(quoteResponse),
  pageInfo: z.object({
    page: z.number().int(),
    perPage: z.number().int(),
    totalCount: z.number().int(),
    pageCount: z.number().int(),
  }),
});
