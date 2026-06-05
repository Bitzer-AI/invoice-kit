import { expect, test } from "vitest";
import { describeForEachAdapter } from "./harness";
import { allFactories } from "./adapters";
import { seed } from "./seed";

async function createDocument(
  repos: any,
  organizationId: string,
  type: "INVOICE" | "QUOTE",
  documentNumber: number,
) {
  const client = await repos.clients.create({ organizationId, name: "Test client" });
  const product = await repos.products.create({
    organizationId,
    name: "Test product",
    price: "100.00",
  });
  return repos.documents.create({
    type,
    organizationId,
    clientId: client.id,
    documentNumber,
    documentNumberPrefix: null,
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
}

describeForEachAdapter("DocumentSequenceRepository", allFactories, (ctx) => {
  test("upsert creates then updates prefix/nextNumber/padWidth", async () => {
    const { organizationId } = await seed(ctx.repos);

    await ctx.repos.documentSequences.upsert({
      organizationId,
      documentType: "INVOICE",
      prefix: "FAC-",
      nextNumber: 1000,
      padWidth: 6,
    });
    let row = await ctx.repos.documentSequences.find({ organizationId, documentType: "INVOICE" });
    expect(row?.prefix).toBe("FAC-");
    expect(row?.nextNumber).toBe(1000);
    expect(row?.padWidth).toBe(6);

    await ctx.repos.documentSequences.upsert({
      organizationId,
      documentType: "INVOICE",
      prefix: "INV-",
      nextNumber: 2000,
      padWidth: 4,
    });
    row = await ctx.repos.documentSequences.find({ organizationId, documentType: "INVOICE" });
    expect(row?.prefix).toBe("INV-");
    expect(row?.nextNumber).toBe(2000);
    expect(row?.padWidth).toBe(4);
  });

  test("maxIssuedNumber returns null with no documents", async () => {
    const { organizationId } = await seed(ctx.repos);
    expect(
      await ctx.repos.documentSequences.maxIssuedNumber({ organizationId, documentType: "INVOICE" }),
    ).toBeNull();
  });

  test("maxIssuedNumber returns the max for (org, type), ignoring other types/orgs", async () => {
    const a = await seed(ctx.repos);
    const b = await seed(ctx.repos);

    await createDocument(ctx.repos, a.organizationId, "INVOICE", 5);
    await createDocument(ctx.repos, a.organizationId, "INVOICE", 12);
    // Excluded: a QUOTE with a higher number for the same org.
    await createDocument(ctx.repos, a.organizationId, "QUOTE", 99);
    // Excluded: an INVOICE with a higher number for a different org.
    await createDocument(ctx.repos, b.organizationId, "INVOICE", 100);

    expect(
      await ctx.repos.documentSequences.maxIssuedNumber({
        organizationId: a.organizationId,
        documentType: "INVOICE",
      }),
    ).toBe(12);
  });

  test("ensure defaults padWidth to null", async () => {
    const { organizationId } = await seed(ctx.repos);
    await ctx.repos.documentSequences.ensure({ organizationId, documentType: "QUOTE" });
    const row = await ctx.repos.documentSequences.find({ organizationId, documentType: "QUOTE" });
    expect(row?.padWidth).toBeNull();
    expect(row?.nextNumber).toBe(1);
  });
});
