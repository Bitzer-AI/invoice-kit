import type { Client } from "../../types";
import type { ClientResponse } from "./validation";

export function clientToResponse(c: Client): ClientResponse {
  return {
    id: c.id,
    name: c.name,
    email: c.email,
    phone: c.phone,
    taxId: c.taxId,
    taxIdType: c.taxIdType,
    country: c.country,
    addressLine1: c.addressLine1,
    city: c.city,
    state: c.state,
    postalCode: c.postalCode,
    createdAt: c.createdAt.toISOString(),
    updatedAt: c.updatedAt.toISOString(),
  };
}
