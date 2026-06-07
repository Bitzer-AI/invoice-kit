import { expect, test } from "vitest";
import { describeForEachAdapter } from "./harness";
import { allFactories } from "./adapters";
import { seed } from "./seed";

async function createQuoteFixture(
  ctx: { repos: any },
  organizationId: string,
  overrides: Partial<{
    documentNumber: number;
    documentNumberPrefix: string | null;
    status: "draft" | "sent" | "accepted" | "rejected" | "converted";
    validUntil: Date | null;
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
    type: "QUOTE",
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
  const quote = await ctx.repos.quotes.create({
    documentId: document.id,
    status: overrides.status ?? "draft",
    validUntil: overrides.validUntil ?? null,
  });
  return { client, product, document, quote };
}

describeForEachAdapter("QuoteRepository", allFactories, (ctx) => {
  test("create and findById returns quote with document + line items", async () => {
    const { organizationId } = await seed(ctx.repos);
    const { quote } = await createQuoteFixture(ctx, organizationId);
    const found = await ctx.repos.quotes.findById(quote.id, organizationId);
    expect(found).not.toBeNull();
    expect(found!.document.lineItems).toHaveLength(1);
    expect(found!.status).toBe("draft");
  });

  test("findById org-scoped", async () => {
    const a = await seed(ctx.repos);
    const b = await seed(ctx.repos);
    const { quote } = await createQuoteFixture(ctx, a.organizationId);
    expect(await ctx.repos.quotes.findById(quote.id, b.organizationId)).toBeNull();
  });

  test("findByDocumentNumber matches on (org, prefix, number)", async () => {
    const { organizationId } = await seed(ctx.repos);
    await createQuoteFixture(ctx, organizationId, {
      documentNumber: 7,
      documentNumberPrefix: "Q",
    });
    const found = await ctx.repos.quotes.findByDocumentNumber({
      organizationId,
      prefix: "Q",
      documentNumber: 7,
    });
    expect(found).not.toBeNull();
    const missing = await ctx.repos.quotes.findByDocumentNumber({
      organizationId,
      prefix: "Q",
      documentNumber: 8,
    });
    expect(missing).toBeNull();
  });

  test("list filters by status and clientId", async () => {
    const { organizationId } = await seed(ctx.repos);
    const f1 = await createQuoteFixture(ctx, organizationId, {
      documentNumber: 1,
      status: "draft",
    });
    await createQuoteFixture(ctx, organizationId, {
      documentNumber: 2,
      status: "accepted",
    });
    const drafts = await ctx.repos.quotes.list({
      organizationId,
      status: "draft",
    });
    expect(drafts.data).toHaveLength(1);
    const byClient = await ctx.repos.quotes.list({
      organizationId,
      clientId: f1.client.id,
    });
    expect(byClient.data.length).toBeGreaterThanOrEqual(1);
  });

  test("list searches by client name and sorts by documentNumber", async () => {
    const { organizationId } = await seed(ctx.repos);
    await createQuoteFixture(ctx, organizationId, {
      documentNumber: 10,
      documentNumberPrefix: "QA",
      clientName: "Wayne Enterprises",
    });
    await createQuoteFixture(ctx, organizationId, {
      documentNumber: 20,
      documentNumberPrefix: "QB",
      clientName: "Stark Industries",
    });

    const byClient = await ctx.repos.quotes.list({ organizationId, query: "stark" });
    expect(byClient.data).toHaveLength(1);
    expect(byClient.data[0].document.documentNumber).toBe(20);

    const desc = await ctx.repos.quotes.list({
      organizationId,
      sortBy: "documentNumber",
      sortDir: "desc",
    });
    expect(desc.data.map((q) => q.document.documentNumber)).toEqual([20, 10]);
  });

  test("update patches status and validUntil", async () => {
    const { organizationId } = await seed(ctx.repos);
    const { quote } = await createQuoteFixture(ctx, organizationId);
    const valid = new Date("2026-03-01");
    const updated = await ctx.repos.quotes.update(quote.id, organizationId, {
      status: "accepted",
      validUntil: valid,
    });
    expect(updated.status).toBe("accepted");
    expect(updated.validUntil?.toISOString()).toBe(valid.toISOString());
  });

  test("delete removes the quote row", async () => {
    const { organizationId } = await seed(ctx.repos);
    const { quote } = await createQuoteFixture(ctx, organizationId);
    await ctx.repos.quotes.delete(quote.id, organizationId);
    expect(await ctx.repos.quotes.findById(quote.id, organizationId)).toBeNull();
  });
});
