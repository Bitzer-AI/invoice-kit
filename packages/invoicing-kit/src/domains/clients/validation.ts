import { z } from "zod";

export const createClientBody = z.object({
  name: z.string().min(1).max(255),
  email: z.string().email().optional().nullable(),
  phone: z.string().optional().nullable(),
  country: z.string().length(2).optional().nullable(),
  addressLine1: z.string().optional().nullable(),
  city: z.string().optional().nullable(),
  state: z.string().optional().nullable(),
  postalCode: z.string().optional().nullable(),
});
export type CreateClientBody = z.infer<typeof createClientBody>;

export const updateClientBody = createClientBody.partial();
export type UpdateClientBody = z.infer<typeof updateClientBody>;

export const listClientsQuery = z.object({
  page: z.coerce.number().int().positive().optional(),
  perPage: z.coerce.number().int().positive().max(100).optional(),
  query: z.string().optional(),
});
export type ListClientsQuery = z.infer<typeof listClientsQuery>;

export const clientResponse = z.object({
  id: z.string(),
  name: z.string(),
  email: z.string().nullable(),
  phone: z.string().nullable(),
  country: z.string().nullable(),
  addressLine1: z.string().nullable(),
  city: z.string().nullable(),
  state: z.string().nullable(),
  postalCode: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type ClientResponse = z.infer<typeof clientResponse>;

export const clientListResponse = z.object({
  data: z.array(clientResponse),
  pageInfo: z.object({
    page: z.number().int(),
    perPage: z.number().int(),
    totalCount: z.number().int(),
    pageCount: z.number().int(),
  }),
});
export type ClientListResponse = z.infer<typeof clientListResponse>;
