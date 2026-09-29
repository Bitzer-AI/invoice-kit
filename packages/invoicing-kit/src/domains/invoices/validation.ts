import { z } from "zod";
import { InvoiceStatus } from "../../types";
import { currencyCodeSchema } from "../../lib/currency";
import { lineItemSchema } from "../../lib/line-item";
import { exchangeRateSchema } from "../../lib/exchange";
import {
  documentMoneyResponseFields,
  lineItemBaseResponseFields,
  lineItemTaxBaseResponseFields,
} from "../../lib/document-response";

export const createInvoiceBody = z.strictObject({
  clientId: z.string().min(1),
  subject: z.string().trim().min(1).nullable().optional(),
  documentNumberPrefix: z.string().max(20).optional().nullable(),
  issueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "YYYY-MM-DD"),
  dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "YYYY-MM-DD").optional().nullable(),
  notes: z.string().optional().nullable(),
  currency: currencyCodeSchema.optional(),
  lineItems: z.array(lineItemSchema).min(1),
  paymentMethodIds: z.array(z.string().min(1)).default([]),
  exchangeRate: exchangeRateSchema.optional().nullable(),
});
export type CreateInvoiceBody = z.infer<typeof createInvoiceBody>;

export const updateInvoiceBody = z.strictObject({
  clientId: z.string().min(1).optional(),
  subject: z.string().trim().min(1).nullable().optional(),
  documentNumberPrefix: z.string().max(20).optional().nullable(),
  issueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable(),
  notes: z.string().optional().nullable(),
  lineItems: z.array(lineItemSchema).min(1).optional(),
  paymentMethodIds: z.array(z.string().min(1)).optional(),
  exchangeRate: exchangeRateSchema.optional().nullable(),
});
export type UpdateInvoiceBody = z.infer<typeof updateInvoiceBody>;

export const listInvoicesQuery = z.object({
  page: z.coerce.number().int().positive().optional(),
  perPage: z.coerce.number().int().positive().max(100).optional(),
  status: z.string().transform((value) => value.split(",")).pipe(
    z.array(z.enum(InvoiceStatus)).min(1),
  ).optional(),
  clientId: z.string().optional(),
  currency: currencyCodeSchema.optional(),
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

export const bulkResultResponse = z.object({ count: z.number().int() });

export const convertFromQuoteBody = z.object({
  paymentMethodIds: z.array(z.string()).optional(),
});
export type ConvertFromQuoteBody = z.infer<typeof convertFromQuoteBody>;

export const voidInvoiceBody = z.strictObject({
  reason: z.string().trim().min(1).max(500),
});
export type VoidInvoiceBody = z.infer<typeof voidInvoiceBody>;

const lineItemResponse = z.object({
  id: z.string(),
  productId: z.string().nullable(),
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
  }).nullable(),
  taxes: z.array(
    z.object({ id: z.string(), taxId: z.string(), taxAmount: z.string(), ...lineItemTaxBaseResponseFields }),
  ),
  ...lineItemBaseResponseFields,
});

export const invoiceResponse = z.object({
  id: z.string(),
  documentId: z.string(),
  status: z.nativeEnum(InvoiceStatus),
  subject: z.string().nullable(),
  paidDate: z.string().nullable(),
  convertedFromQuoteId: z.string().nullable(),
  document: z.object({
    clientId: z.string(),
    client: z
      .object({
        id: z.string(),
        name: z.string(),
        email: z.string().nullable(),
        phone: z.string().nullable(),
        taxId: z.string().nullable(),
        taxIdType: z.string().nullable(),
        country: z.string().nullable(),
        addressLine1: z.string().nullable(),
        city: z.string().nullable(),
        state: z.string().nullable(),
        postalCode: z.string().nullable(),
      })
      .nullable(),
    documentNumberPrefix: z.string().nullable(),
    documentNumber: z.number().int().nullable(),
    documentNumberPadWidth: z.number().int().min(1).max(12).nullable(),
    issueDate: z.string(),
    dueDate: z.string().nullable(),
    notes: z.string().nullable(),
    currency: z.string(),
    subtotal: z.string().nullable(),
    tax: z.string().nullable(),
    total: z.string().nullable(),
    paymentMethodIds: z.array(z.string()),
    lineItems: z.array(lineItemResponse),
    ...documentMoneyResponseFields,
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
