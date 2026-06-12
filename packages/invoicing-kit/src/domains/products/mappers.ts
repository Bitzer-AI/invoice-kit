import type { Product } from "../../types";
import type { ProductResponse } from "./validation";

export function productToResponse(product: Product): ProductResponse {
  return {
    id: product.id,
    name: product.name,
    description: product.description,
    price: product.price,
    currency: product.currency,
    sourceType: product.sourceType,
    sourceId: product.sourceId,
    createdAt: product.createdAt.toISOString(),
    updatedAt: product.updatedAt.toISOString(),
  };
}
