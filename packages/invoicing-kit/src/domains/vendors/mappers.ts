import type { Vendor } from "../../types";
import type { VendorResponse } from "./validation";

export function vendorToResponse(v: Vendor): VendorResponse {
  return {
    id: v.id,
    name: v.name,
    email: v.email,
    phone: v.phone,
    taxId: v.taxId,
    taxIdType: v.taxIdType,
    isActive: v.isActive,
    createdAt: v.createdAt.toISOString(),
    updatedAt: v.updatedAt.toISOString(),
  };
}
