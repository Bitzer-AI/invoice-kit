import { z } from "zod";

export const createVendorBody = z.object({
  name: z.string().min(1).max(255),
  email: z.string().email().optional().nullable(),
  phone: z.string().optional().nullable(),
  taxId: z.string().max(20).optional().nullable(),
  taxIdType: z.enum(["RNC", "CEDULA", "FOREIGN"]).optional().nullable(),
  isActive: z.boolean().optional(),
});
export type CreateVendorBody = z.infer<typeof createVendorBody>;

export const updateVendorBody = createVendorBody.partial();
export type UpdateVendorBody = z.infer<typeof updateVendorBody>;

export const listVendorsQuery = z.object({
  page: z.coerce.number().int().positive().optional(),
  perPage: z.coerce.number().int().positive().max(100).optional(),
  query: z.string().optional(),
});
export type ListVendorsQuery = z.infer<typeof listVendorsQuery>;

export const vendorResponse = z.object({
  id: z.string(),
  name: z.string(),
  email: z.string().nullable(),
  phone: z.string().nullable(),
  taxId: z.string().nullable(),
  taxIdType: z.string().nullable(),
  isActive: z.boolean(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type VendorResponse = z.infer<typeof vendorResponse>;

export const vendorListResponse = z.object({
  data: z.array(vendorResponse),
  pageInfo: z.object({
    page: z.number().int(),
    perPage: z.number().int(),
    totalCount: z.number().int(),
    pageCount: z.number().int(),
  }),
});
export type VendorListResponse = z.infer<typeof vendorListResponse>;
