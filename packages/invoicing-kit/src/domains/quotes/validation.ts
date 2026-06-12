import { z } from "zod";
import { currencyCodeSchema } from "../../lib/currency";
import { lineItemSchema } from "../../lib/line-item";

export const createQuoteBody = z.object({
  clientId: z.string(),
  documentNumberPrefix: z.string().max(20).optional().nullable(),
  /** One-off override of the assigned number for THIS document. When omitted, the series counter assigns it. */
  documentNumber: z.number().int().positive().optional(),
  issueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "YYYY-MM-DD"),
  validUntil: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable(),
  notes: z.string().optional().nullable(),
  currency: currencyCodeSchema.optional(),
  status: z.enum(["draft", "sent", "accepted", "rejected", "converted"]).default("draft"),
  lineItems: z.array(lineItemSchema).min(1),
  paymentMethodIds: z.array(z.string()).default([]),
});
export type CreateQuoteBody = z.infer<typeof createQuoteBody>;

export const updateQuoteBody = z.object({
  clientId: z.string().optional(),
  documentNumberPrefix: z.string().max(20).optional().nullable(),
  documentNumber: z.number().int().positive().optional(),
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
  query: z.string().trim().min(1).optional(),
  sortBy: z.enum(["issueDate", "validUntil", "total", "documentNumber", "status"]).optional(),
  sortDir: z.enum(["asc", "desc"]).optional(),
  issueDateFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  issueDateTo: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});
export type ListQuotesQuery = z.infer<typeof listQuotesQuery>;

export const bulkDeleteQuotesBody = z.object({
  ids: z.array(z.string()).min(1).max(200),
});
export type BulkDeleteQuotesBody = z.infer<typeof bulkDeleteQuotesBody>;

export const bulkUpdateQuoteStatusBody = z.object({
  ids: z.array(z.string()).min(1).max(200),
  status: z.enum(["draft", "sent", "accepted", "rejected"]),
});
export type BulkUpdateQuoteStatusBody = z.infer<typeof bulkUpdateQuoteStatusBody>;

export const bulkResultResponse = z.object({ count: z.number().int() });

const lineItemResponse = z.object({
  id: z.string(),
  productId: z.string(),
  quantity: z.string(),
  price: z.string(),
  currency: z.string(),
  taxAmount: z.string(),
  total: z.string(),
  description: z.string().nullable(),
  metadata: z.record(z.string(), z.unknown()).nullable(),
  source: z
    .object({ type: z.string(), id: z.string(), name: z.string() })
    .nullable(),
  product: z.object({
    id: z.string(),
    name: z.string(),
    description: z.string().nullable(),
    price: z.string(),
    currency: z.string(),
  }),
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
    currency: z.string(),
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
