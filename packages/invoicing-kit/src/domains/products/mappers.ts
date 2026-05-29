import type { Product } from "../../types";
import type { ProductResponse } from "./validation";

export function productToResponse(p: Product): ProductResponse {
  return {
    id: p.id,
    name: p.name,
    description: p.description,
    price: p.price,
    sourceType: p.sourceType,
    sourceId: p.sourceId,
    createdAt: p.createdAt.toISOString(),
    updatedAt: p.updatedAt.toISOString(),
  };
}
