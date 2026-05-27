import type { PaymentMethod } from "../../types";
import type { PaymentMethodResponse } from "./validation";

export function paymentMethodToResponse(pm: PaymentMethod): PaymentMethodResponse {
  return {
    id: pm.id,
    name: pm.name,
    type: pm.type,
    instructions: pm.instructions,
    metadata: pm.metadata,
    isActive: pm.isActive,
    isDefault: pm.isDefault,
    createdAt: pm.createdAt.toISOString(),
    updatedAt: pm.updatedAt.toISOString(),
  };
}
