import { z } from "zod";
import { lineItemSchema } from "../../lib/line-item";

export const noteTypeEnum = z.enum(["CREDIT", "DEBIT"]);
export const noteStatusEnum = z.enum(["draft", "issued"]);

export const createNoteBody = z
  .object({
    noteType: noteTypeEnum,
    referencedDocumentId: z.string(),
    clientId: z.string().optional().nullable(),
    vendorId: z.string().optional().nullable(),
    externalDocumentNumber: z.string().max(40).optional().nullable(),
    issueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "YYYY-MM-DD"),
    dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable(),
    notes: z.string().optional().nullable(),
    currency: z.string().length(3).optional(),
    status: noteStatusEnum.default("draft"),
    lineItems: z.array(lineItemSchema).min(1),
  })
  .refine((b) => (b.clientId == null) !== (b.vendorId == null), {
    message: "Exactly one of clientId or vendorId is required",
  });
export type CreateNoteBody = z.infer<typeof createNoteBody>;

export const updateNoteBody = z.object({
  externalDocumentNumber: z.string().max(40).optional().nullable(),
  issueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable(),
  notes: z.string().optional().nullable(),
  status: noteStatusEnum.optional(),
  lineItems: z.array(lineItemSchema).min(1).optional(),
});
export type UpdateNoteBody = z.infer<typeof updateNoteBody>;

export const listNotesQuery = z.object({
  page: z.coerce.number().int().positive().optional(),
  perPage: z.coerce.number().int().positive().max(100).optional(),
  status: z.string().optional(), // comma-separated
  type: z.enum(["CREDIT_NOTE", "DEBIT_NOTE"]).optional(),
  clientId: z.string().optional(),
  vendorId: z.string().optional(),
  referencedDocumentId: z.string().optional(),
  query: z.string().trim().min(1).optional(),
  sortBy: z.enum(["issueDate", "total", "status"]).optional(),
  sortDir: z.enum(["asc", "desc"]).optional(),
  issueDateFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  issueDateTo: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});
export type ListNotesQuery = z.infer<typeof listNotesQuery>;

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

export const noteResponse = z.object({
  id: z.string(),
  documentId: z.string(),
  status: noteStatusEnum,
  document: z.object({
    type: z.string(),
    clientId: z.string().nullable(),
    vendorId: z.string().nullable(),
    referencedDocumentId: z.string().nullable(),
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
export type NoteResponse = z.infer<typeof noteResponse>;

export const noteListResponse = z.object({
  data: z.array(noteResponse),
  pageInfo: z.object({
    page: z.number().int(),
    perPage: z.number().int(),
    totalCount: z.number().int(),
    pageCount: z.number().int(),
  }),
});
export type NoteListResponse = z.infer<typeof noteListResponse>;
