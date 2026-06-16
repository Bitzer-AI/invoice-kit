import { z } from "zod";
import { currencyCodeSchema } from "../../lib/currency";
import { lineItemSchema } from "../../lib/line-item";

export const vendorBillStatusEnum = z.enum(["draft", "received", "partially_paid", "paid"]);

export const createVendorBillBody = z.object({
  vendorId: z.string(),
  externalDocumentNumber: z.string().max(40).optional().nullable(),
  issueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "YYYY-MM-DD"),
  dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable(),
  notes: z.string().optional().nullable(),
  currency: currencyCodeSchema.optional(),
  status: vendorBillStatusEnum.default("draft"),
  lineItems: z.array(lineItemSchema).min(1),
});
export type CreateVendorBillBody = z.infer<typeof createVendorBillBody>;

export const updateVendorBillBody = z.object({
  externalDocumentNumber: z.string().max(40).optional().nullable(),
  issueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable(),
  notes: z.string().optional().nullable(),
  status: vendorBillStatusEnum.optional(),
  lineItems: z.array(lineItemSchema).min(1).optional(),
});
export type UpdateVendorBillBody = z.infer<typeof updateVendorBillBody>;

export const listVendorBillsQuery = z.object({
  page: z.coerce.number().int().positive().optional(),
  perPage: z.coerce.number().int().positive().max(100).optional(),
  status: z.string().optional(), // comma-separated
  vendorId: z.string().optional(),
  query: z.string().trim().min(1).optional(),
  sortBy: z.enum(["issueDate", "total", "status"]).optional(),
  sortDir: z.enum(["asc", "desc"]).optional(),
  issueDateFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  issueDateTo: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});
export type ListVendorBillsQuery = z.infer<typeof listVendorBillsQuery>;

const lineItemResponse = z.object({
  id: z.string(),
  productId: z.string(),
  quantity: z.string(),
  price: z.string(),
  currency: z.string(),
  taxAmount: z.string(),
  total: z.string(),
  description: z.string().nullable(),
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

export const vendorBillResponse = z.object({
  id: z.string(),
  documentId: z.string(),
  status: vendorBillStatusEnum,
  document: z.object({
    vendorId: z.string().nullable(),
    vendor: z
      .object({
        id: z.string(),
        name: z.string(),
        email: z.string().nullable(),
        phone: z.string().nullable(),
        taxId: z.string().nullable(),
        taxIdType: z.string().nullable(),
      })
      .nullable(),
    clientId: z.string().nullable(),
    externalDocumentNumber: z.string().nullable(),
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
export type VendorBillResponse = z.infer<typeof vendorBillResponse>;

export const vendorBillListResponse = z.object({
  data: z.array(vendorBillResponse),
  pageInfo: z.object({
    page: z.number().int(),
    perPage: z.number().int(),
    totalCount: z.number().int(),
    pageCount: z.number().int(),
  }),
});
export type VendorBillListResponse = z.infer<typeof vendorBillListResponse>;
