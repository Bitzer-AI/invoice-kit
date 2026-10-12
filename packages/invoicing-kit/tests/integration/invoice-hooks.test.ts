import { describe, it, expect } from "vitest";
import { createInvoicingKit } from "../../src/create";
import { inMemoryAdapter } from "../../src/adapters/memory";
import type { InvoicingKitHooks } from "../../src/config";
import type { AuthContext } from "../../src/auth/types";
import { InvoiceStatus } from "../../src/types";
import { DEFAULT_CURRENCY } from "../../src/lib/currency";

const ctx: AuthContext = { userId: "u1", organizationId: "org1", role: "owner" };

function makeKit(hooks: InvoicingKitHooks) {
  const repos = inMemoryAdapter();
  return createInvoicingKit({ adapter: repos, auth: {} as never, hooks });
}

async function seedClientAndProduct(k: ReturnType<typeof makeKit>) {
  const client = await k.services.clients.create({ name: "C" }, ctx);
  const product = await k.services.products.create({ name: "P", price: "100" }, ctx);
  return { clientId: client.id, productId: product.id };
}

function line(productId: string) {
  return { productId, quantity: "1", price: "10000", taxIds: [] as string[] };
}

const baseInvoice = (clientId: string, productId: string) => ({
  clientId,
  documentNumberPrefix: null,
  issueDate: "2025-01-01",
  notes: null,
  lineItems: [line(productId)],
  paymentMethodIds: [] as string[],
});

describe("onInvoiceIssued hook", () => {
  it("fires when a draft invoice is issued", async () => {
    const issued: string[] = [];
    const k = makeKit({ onInvoiceIssued: ({ invoiceId }) => void issued.push(invoiceId) });
    const { clientId, productId } = await seedClientAndProduct(k);
    const inv = await k.services.invoices.create(baseInvoice(clientId, productId), ctx);

    await k.services.invoices.issue(inv.id, ctx);

    expect(issued).toEqual([inv.id]);
  });

  it("does NOT fire when a draft is created or edited", async () => {
    const issued: string[] = [];
    const k = makeKit({ onInvoiceIssued: ({ invoiceId }) => void issued.push(invoiceId) });
    const { clientId, productId } = await seedClientAndProduct(k);

    const inv = await k.services.invoices.create(baseInvoice(clientId, productId), ctx);
    await k.services.invoices.update(inv.id, { notes: "edited" }, ctx);

    expect(issued).toEqual([]);
  });

  it("fires once: issuing again and paying the invoice do NOT fire it again", async () => {
    const issued: string[] = [];
    const k = makeKit({ onInvoiceIssued: ({ invoiceId }) => void issued.push(invoiceId) });
    const { clientId, productId } = await seedClientAndProduct(k);
    const inv = await k.services.invoices.create(baseInvoice(clientId, productId), ctx);

    await k.services.invoices.issue(inv.id, ctx);
    await k.services.invoices.issue(inv.id, ctx);
    expect(issued).toEqual([inv.id]);

    await k.services.payments.recordManualPayment(
      inv.id,
      { amount: "10000", currency: DEFAULT_CURRENCY, provider: "manual" },
      ctx,
    );
    expect((await k.services.invoices.findById(inv.id, ctx)).status).toBe(InvoiceStatus.Paid);
    expect(issued).toEqual([inv.id]);
  });

  it("a throwing handler does not fail the issue (invoice is still issued)", async () => {
    const k = makeKit({
      onInvoiceIssued: () => {
        throw new Error("boom");
      },
    });
    const { clientId, productId } = await seedClientAndProduct(k);
    const inv = await k.services.invoices.create(baseInvoice(clientId, productId), ctx);

    const issuedInvoice = await k.services.invoices.issue(inv.id, ctx);

    expect(issuedInvoice.status).toBe(InvoiceStatus.Issued);
    const found = await k.services.invoices.findById(inv.id, ctx);
    expect(found.document.documentNumber).toBe(1);
  });

  it("fires once per issued invoice and never for one left as a draft", async () => {
    const issued: string[] = [];
    const k = makeKit({ onInvoiceIssued: ({ invoiceId }) => void issued.push(invoiceId) });
    const { clientId, productId } = await seedClientAndProduct(k);

    const draftA = await k.services.invoices.create(baseInvoice(clientId, productId), ctx);
    const draftB = await k.services.invoices.create(baseInvoice(clientId, productId), ctx);
    await k.services.invoices.create(baseInvoice(clientId, productId), ctx);

    await k.services.invoices.issue(draftA.id, ctx);
    await k.services.invoices.issue(draftB.id, ctx);

    expect(issued).toEqual([draftA.id, draftB.id]);
  });
});
