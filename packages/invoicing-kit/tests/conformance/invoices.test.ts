// tests/conformance/invoices.test.ts
import { expect, test } from "vitest";
import { describeForEachAdapter } from "./harness";
import { allFactories } from "./adapters";
import { seed } from "./seed";

async function createInvoiceFixture(
  ctx: { repos: any },
  organizationId: string,
  overrides: Partial<{
    documentNumber: number;
    documentNumberPrefix: string | null;
    status: "draft" | "sent" | "paid";
  }> = {},
) {
  const client = await ctx.repos.clients.create({
    organizationId,
    name: "Test client",
  });
  const product = await ctx.repos.products.create({
    organizationId,
    name: "Test product",
    price: "100.00",
  });
  const document = await ctx.repos.documents.create({
    type: "INVOICE",
    organizationId,
    clientId: client.id,
    documentNumber: overrides.documentNumber ?? 1,
    documentNumberPrefix: overrides.documentNumberPrefix ?? null,
    issueDate: new Date("2026-01-15"),
    subtotal: 100n,
    tax: 0n,
    total: 100n,
    lineItems: [
      {
        productId: product.id,
        quantity: "1",
        price: 100n,
        taxes: [],
        taxAmount: 0n,
        total: 100n,
      },
    ],
  });
  const invoice = await ctx.repos.invoices.create({
    documentId: document.id,
    status: overrides.status ?? "draft",
  });
  return { client, product, document, invoice };
}

describeForEachAdapter("InvoiceRepository", allFactories, (ctx) => {
  test("create and findById returns invoice with document + line items", async () => {
    const { organizationId } = await seed(ctx.repos);
    const { invoice } = await createInvoiceFixture(ctx, organizationId);
    const found = await ctx.repos.invoices.findById(invoice.id, organizationId);
    expect(found).not.toBeNull();
    expect(found!.document.lineItems).toHaveLength(1);
    expect(found!.status).toBe("draft");
  });

  test("findById org-scoped", async () => {
    const a = await seed(ctx.repos);
    const b = await seed(ctx.repos);
    const { invoice } = await createInvoiceFixture(ctx, a.organizationId);
    expect(await ctx.repos.invoices.findById(invoice.id, b.organizationId)).toBeNull();
  });

  test("findByDocumentNumber matches on (org, prefix, number)", async () => {
    const { organizationId } = await seed(ctx.repos);
    await createInvoiceFixture(ctx, organizationId, {
      documentNumber: 42,
      documentNumberPrefix: "INV",
    });
    const found = await ctx.repos.invoices.findByDocumentNumber({
      organizationId,
      prefix: "INV",
      documentNumber: 42,
    });
    expect(found).not.toBeNull();
    const missing = await ctx.repos.invoices.findByDocumentNumber({
      organizationId,
      prefix: "INV",
      documentNumber: 43,
    });
    expect(missing).toBeNull();
  });

  test("list filters by status and clientId", async () => {
    const { organizationId } = await seed(ctx.repos);
    const f1 = await createInvoiceFixture(ctx, organizationId, {
      documentNumber: 1,
      status: "draft",
    });
    await createInvoiceFixture(ctx, organizationId, {
      documentNumber: 2,
      status: "paid",
    });
    const drafts = await ctx.repos.invoices.list({
      organizationId,
      status: "draft",
    });
    expect(drafts.data).toHaveLength(1);
    const byClient = await ctx.repos.invoices.list({
      organizationId,
      clientId: f1.client.id,
    });
    expect(byClient.data.length).toBeGreaterThanOrEqual(1);
  });

  test("list filters by issue date range", async () => {
    const { organizationId } = await seed(ctx.repos);
    // Fixture creates issueDate 2026-01-15
    await createInvoiceFixture(ctx, organizationId, { documentNumber: 1 });
    const within = await ctx.repos.invoices.list({
      organizationId,
      issueDateFrom: new Date("2026-01-01"),
      issueDateTo: new Date("2026-01-31"),
    });
    expect(within.data).toHaveLength(1);
    const outside = await ctx.repos.invoices.list({
      organizationId,
      issueDateFrom: new Date("2027-01-01"),
    });
    expect(outside.data).toHaveLength(0);
  });

  test("update patches status and paidDate", async () => {
    const { organizationId } = await seed(ctx.repos);
    const { invoice } = await createInvoiceFixture(ctx, organizationId);
    const paid = new Date("2026-02-01");
    const updated = await ctx.repos.invoices.update(invoice.id, organizationId, {
      status: "paid",
      paidDate: paid,
    });
    expect(updated.status).toBe("paid");
    expect(updated.paidDate?.toISOString()).toBe(paid.toISOString());
  });

  test("delete removes the invoice (and via document cascade, line items)", async () => {
    const { organizationId } = await seed(ctx.repos);
    const { invoice } = await createInvoiceFixture(ctx, organizationId);
    await ctx.repos.invoices.delete(invoice.id, organizationId);
    expect(await ctx.repos.invoices.findById(invoice.id, organizationId)).toBeNull();
  });
});
