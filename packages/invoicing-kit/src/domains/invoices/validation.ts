import { z } from "zod";
import { lineItemSchema } from "../../lib/line-item";

export const createInvoiceBody = z.object({
  clientId: z.string(),
  documentNumberPrefix: z.string().max(20).optional().nullable(),
  /** One-off override of the assigned number for THIS document. When omitted, the series counter assigns it. */
  documentNumber: z.number().int().positive().optional(),
  issueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "YYYY-MM-DD"),
  paidDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable(),
  notes: z.string().optional().nullable(),
  currency: z.string().length(3).optional(),
  status: z.enum(["draft", "sent", "paid", "partially_paid"]).default("draft"),
  lineItems: z.array(lineItemSchema).min(1),
  paymentMethodIds: z.array(z.string()).default([]),
});
export type CreateInvoiceBody = z.infer<typeof createInvoiceBody>;

export const updateInvoiceBody = z.object({
  clientId: z.string().optional(),
  documentNumberPrefix: z.string().max(20).optional().nullable(),
  documentNumber: z.number().int().positive().optional(),
  issueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  paidDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable(),
  notes: z.string().optional().nullable(),
  status: z.enum(["draft", "sent", "paid", "partially_paid"]).optional(),
  lineItems: z.array(lineItemSchema).min(1).optional(),
  paymentMethodIds: z.array(z.string()).optional(),
});
export type UpdateInvoiceBody = z.infer<typeof updateInvoiceBody>;

export const listInvoicesQuery = z.object({
  page: z.coerce.number().int().positive().optional(),
  perPage: z.coerce.number().int().positive().max(100).optional(),
  status: z.string().optional(), // comma-separated
  clientId: z.string().optional(),
  query: z.string().trim().min(1).optional(),
  sortBy: z.enum(["issueDate", "dueDate", "total", "documentNumber", "status"]).optional(),
  sortDir: z.enum(["asc", "desc"]).optional(),
  issueDateFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  issueDateTo: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  /** Document.dueDate strictly before this date — used for "overdue" filtering. */
  dueBefore: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});
export type ListInvoicesQuery = z.infer<typeof listInvoicesQuery>;

export const bulkDeleteInvoicesBody = z.object({
  ids: z.array(z.string()).min(1).max(200),
});
export type BulkDeleteInvoicesBody = z.infer<typeof bulkDeleteInvoicesBody>;

export const bulkUpdateInvoiceStatusBody = z.object({
  ids: z.array(z.string()).min(1).max(200),
  status: z.enum(["draft", "sent", "paid"]),
});
export type BulkUpdateInvoiceStatusBody = z.infer<typeof bulkUpdateInvoiceStatusBody>;

export const bulkResultResponse = z.object({ count: z.number().int() });

export const convertFromQuoteBody = z.object({
  paymentMethodIds: z.array(z.string()).optional(),
});
export type ConvertFromQuoteBody = z.infer<typeof convertFromQuoteBody>;

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

export const invoiceResponse = z.object({
  id: z.string(),
  documentId: z.string(),
  status: z.enum(["draft", "sent", "paid", "partially_paid"]),
  paidDate: z.string().nullable(),
  convertedFromQuoteId: z.string().nullable(),
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
export type InvoiceResponse = z.infer<typeof invoiceResponse>;

export const invoiceListResponse = z.object({
  data: z.array(invoiceResponse),
  pageInfo: z.object({
    page: z.number().int(),
    perPage: z.number().int(),
    totalCount: z.number().int(),
    pageCount: z.number().int(),
  }),
});
