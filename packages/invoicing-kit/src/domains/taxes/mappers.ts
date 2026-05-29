import type { Tax } from "../../types";
import type { TaxResponse } from "./validation";

export function taxToResponse(t: Tax): TaxResponse {
  return {
    id: t.id,
    name: t.name,
    description: t.description,
    type: t.type,
    rate: t.rate,
    isActive: t.isActive,
    isDefault: t.isDefault,
    fiscalCategory: t.fiscalCategory,
    createdAt: t.createdAt.toISOString(),
    updatedAt: t.updatedAt.toISOString(),
  };
}
