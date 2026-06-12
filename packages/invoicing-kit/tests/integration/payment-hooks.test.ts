import { describe, it, expect } from "vitest";
import { createInvoicingKit } from "../../src/create";
import { inMemoryAdapter } from "../../src/adapters/memory";
import type { InvoicingKitHooks } from "../../src/config";
import type { AuthContext } from "../../src/auth/types";

const ctx: AuthContext = { userId: "u1", organizationId: "org1", role: "owner" };

function makeKit(hooks: InvoicingKitHooks) {
  const repos = inMemoryAdapter();
  return createInvoicingKit({ adapter: repos, auth: {} as never, hooks });
}

async function seedClientAndProduct(k: ReturnType<typeof makeKit>) {
  const client = await k.services.clients.create({ name: "C" }, ctx);
  const product = await k.services.products.create(
    { name: "P", price: "100", currency: "dop" },
    ctx,
  );
  return { clientId: client.id, productId: product.id };
}

function line(productId: string) {
  return { productId, quantity: "1", price: "10000", taxIds: [] as string[] };
}

const baseInvoice = (clientId: string, productId: string) => ({
  clientId,
  documentNumberPrefix: null,
  issueDate: "2025-01-01",
  paidDate: null,
  notes: null,
  currency: "DOP",
  lineItems: [line(productId)],
  paymentMethodIds: [] as string[],
});

async function seedSentInvoice(k: ReturnType<typeof makeKit>) {
  const { clientId, productId } = await seedClientAndProduct(k);
  const inv = await k.services.invoices.create(
    { ...baseInvoice(clientId, productId), status: "sent" },
    ctx,
  );
  return inv;
}

const payment = {
  amount: "10000",
  currency: "DOP",
  provider: "manual",
};

describe("onPaymentSucceeded hook", () => {
  it("fires after a manual payment is recorded (handler sees the new payment id once)", async () => {
    const succeeded: string[] = [];
    const k = makeKit({ onPaymentSucceeded: ({ paymentId }) => void succeeded.push(paymentId) });
    const inv = await seedSentInvoice(k);

    const result = await k.services.payments.recordManualPayment(inv.id, payment, ctx);

    expect(succeeded).toEqual([result.id]);
  });

  it("a throwing handler does not fail the payment (payment still persisted)", async () => {
    const k = makeKit({
      onPaymentSucceeded: () => {
        throw new Error("boom");
      },
    });
    const inv = await seedSentInvoice(k);

    const result = await k.services.payments.recordManualPayment(inv.id, payment, ctx);

    expect(result.id).toBeTruthy();
    const found = await k.services.payments.findById(result.id, ctx);
    expect(found.id).toBe(result.id);
  });
});
