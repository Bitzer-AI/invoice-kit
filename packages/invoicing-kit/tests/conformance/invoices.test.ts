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
    clientName: string;
  }> = {},
) {
  const client = await ctx.repos.clients.create({
    organizationId,
    name: overrides.clientName ?? "Test client",
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

  test("list searches by prefix, number, and client name", async () => {
    const { organizationId } = await seed(ctx.repos);
    await createInvoiceFixture(ctx, organizationId, {
      documentNumber: 100,
      documentNumberPrefix: "B01",
      clientName: "Acme Corp",
    });
    await createInvoiceFixture(ctx, organizationId, {
      documentNumber: 200,
      documentNumberPrefix: "B02",
      clientName: "Globex",
    });

    const byPrefix = await ctx.repos.invoices.list({ organizationId, query: "b01" });
    expect(byPrefix.data).toHaveLength(1);
    expect(byPrefix.data[0].document.documentNumber).toBe(100);

    const byNumber = await ctx.repos.invoices.list({ organizationId, query: "200" });
    expect(byNumber.data).toHaveLength(1);
    expect(byNumber.data[0].document.documentNumber).toBe(200);

    const byClient = await ctx.repos.invoices.list({ organizationId, query: "acme" });
    expect(byClient.data).toHaveLength(1);
    expect(byClient.data[0].document.documentNumber).toBe(100);

    const none = await ctx.repos.invoices.list({ organizationId, query: "zzz-no-match" });
    expect(none.data).toHaveLength(0);
  });

  test("list sorts by documentNumber asc and desc", async () => {
    const { organizationId } = await seed(ctx.repos);
    await createInvoiceFixture(ctx, organizationId, { documentNumber: 3 });
    await createInvoiceFixture(ctx, organizationId, { documentNumber: 1 });
    await createInvoiceFixture(ctx, organizationId, { documentNumber: 2 });

    const asc = await ctx.repos.invoices.list({
      organizationId,
      sortBy: "documentNumber",
      sortDir: "asc",
    });
    expect(asc.data.map((i) => i.document.documentNumber)).toEqual([1, 2, 3]);

    const desc = await ctx.repos.invoices.list({
      organizationId,
      sortBy: "documentNumber",
      sortDir: "desc",
    });
    expect(desc.data.map((i) => i.document.documentNumber)).toEqual([3, 2, 1]);
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
