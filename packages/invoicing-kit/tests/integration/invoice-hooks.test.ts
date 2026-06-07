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
  paidDate: null,
  notes: null,
  lineItems: [line(productId)],
  paymentMethodIds: [] as string[],
});

describe("onInvoiceIssued hook", () => {
  it("fires when an invoice is created non-draft (status 'sent')", async () => {
    const issued: string[] = [];
    const k = makeKit({ onInvoiceIssued: ({ invoiceId }) => void issued.push(invoiceId) });
    const { clientId, productId } = await seedClientAndProduct(k);

    const inv = await k.services.invoices.create(
      { ...baseInvoice(clientId, productId), status: "sent" },
      ctx,
    );

    expect(issued).toEqual([inv.id]);
  });

  it("does NOT fire when created as 'draft'", async () => {
    const issued: string[] = [];
    const k = makeKit({ onInvoiceIssued: ({ invoiceId }) => void issued.push(invoiceId) });
    const { clientId, productId } = await seedClientAndProduct(k);

    await k.services.invoices.create(
      { ...baseInvoice(clientId, productId), status: "draft" },
      ctx,
    );

    expect(issued).toEqual([]);
  });

  it("fires once on draft->sent via update; does NOT fire again on sent->paid", async () => {
    const issued: string[] = [];
    const k = makeKit({ onInvoiceIssued: ({ invoiceId }) => void issued.push(invoiceId) });
    const { clientId, productId } = await seedClientAndProduct(k);

    const inv = await k.services.invoices.create(
      { ...baseInvoice(clientId, productId), status: "draft" },
      ctx,
    );
    expect(issued).toEqual([]);

    await k.services.invoices.update(inv.id, { status: "sent" }, ctx);
    expect(issued).toEqual([inv.id]);

    await k.services.invoices.update(inv.id, { status: "paid" }, ctx);
    expect(issued).toEqual([inv.id]);
  });

  it("a throwing handler does not fail create (invoice still persisted)", async () => {
    const k = makeKit({
      onInvoiceIssued: () => {
        throw new Error("boom");
      },
    });
    const { clientId, productId } = await seedClientAndProduct(k);

    const inv = await k.services.invoices.create(
      { ...baseInvoice(clientId, productId), status: "sent" },
      ctx,
    );

    expect(inv.id).toBeTruthy();
    const found = await k.services.invoices.findById(inv.id, ctx);
    expect(found.id).toBe(inv.id);
  });

  it("bulkUpdateStatus fires once per invoice moved draft->non-draft", async () => {
    const issued: string[] = [];
    const k = makeKit({ onInvoiceIssued: ({ invoiceId }) => void issued.push(invoiceId) });
    const { clientId, productId } = await seedClientAndProduct(k);

    const draftA = await k.services.invoices.create(
      { ...baseInvoice(clientId, productId), status: "draft" },
      ctx,
    );
    const draftB = await k.services.invoices.create(
      { ...baseInvoice(clientId, productId), status: "draft" },
      ctx,
    );
    const alreadySent = await k.services.invoices.create(
      { ...baseInvoice(clientId, productId), status: "sent" },
      ctx,
    );
    expect(issued).toEqual([alreadySent.id]);
    issued.length = 0;

    await k.services.invoices.bulkUpdateStatus([draftA.id, draftB.id, alreadySent.id], "sent", ctx);

    // draftA and draftB transition out of draft; alreadySent was already sent.
    expect(issued.sort()).toEqual([draftA.id, draftB.id].sort());
  });
});
