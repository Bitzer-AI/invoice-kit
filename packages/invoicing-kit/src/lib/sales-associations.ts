import type { Repositories } from "../adapters/types";
import { ClientNotFoundException } from "../domains/clients/exceptions";
import { PaymentMethodNotFoundException } from "../domains/payment-methods/exceptions";

/** Resolve relation IDs through tenant-scoped repositories before writing a document. */
export async function requireSalesClient(
  repos: Repositories,
  organizationId: string,
  clientId: string,
): Promise<void> {
  const client = await repos.clients.findById(clientId, organizationId);
  if (!client) throw ClientNotFoundException();
}

export async function requirePaymentMethods(
  repos: Repositories,
  organizationId: string,
  paymentMethodIds: readonly string[],
): Promise<void> {
  for (const id of new Set(paymentMethodIds)) {
    const method = await repos.paymentMethods.findById(id, organizationId);
    if (!method) throw PaymentMethodNotFoundException();
  }
}
