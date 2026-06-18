import { z } from "zod";
import { ProductUsage } from "../../types";
import { currencyCodeSchema } from "../../lib/currency";

const priceSchema = z.string().regex(/^\d+(\.\d{1,2})?$/, "Invalid decimal price");

export const productUsageSchema = z.nativeEnum(ProductUsage);

export const createProductBody = z.object({
  name: z.string().min(1).max(255),
  description: z.string().optional().nullable(),
  price: priceSchema,
  currency: currencyCodeSchema.optional(),
  sourceType: z.string().min(1).max(255).optional().nullable(),
  sourceId: z.string().min(1).max(255).optional().nullable(),
  usage: productUsageSchema.optional(),
  cost: priceSchema.optional().nullable(),
});
export type CreateProductBody = z.infer<typeof createProductBody>;

export const updateProductBody = createProductBody.partial();
export type UpdateProductBody = z.infer<typeof updateProductBody>;

export const listProductsQuery = z.object({
  page: z.coerce.number().int().positive().optional(),
  perPage: z.coerce.number().int().positive().max(100).optional(),
  query: z.string().optional(),
  usage: productUsageSchema.optional(),
});
export type ListProductsQuery = z.infer<typeof listProductsQuery>;

export const productResponse = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string().nullable(),
  price: z.string(),
  currency: z.string(),
  sourceType: z.string().nullable(),
  sourceId: z.string().nullable(),
  usage: productUsageSchema,
  cost: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type ProductResponse = z.infer<typeof productResponse>;

export const productListResponse = z.object({
  data: z.array(productResponse),
  pageInfo: z.object({
    page: z.number().int(),
    perPage: z.number().int(),
    totalCount: z.number().int(),
    pageCount: z.number().int(),
  }),
});
export type ProductListResponse = z.infer<typeof productListResponse>;
