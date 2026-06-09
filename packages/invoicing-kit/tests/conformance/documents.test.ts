// tests/conformance/documents.test.ts
import { expect, test } from "vitest";
import { describeForEachAdapter } from "./harness";
import { allFactories } from "./adapters";
import { seed } from "./seed";

async function setup(ctx: { repos: any }, organizationId: string) {
  const client = await ctx.repos.clients.create({
    organizationId,
    name: "Test client",
  });
  const product = await ctx.repos.products.create({
    organizationId,
    name: "Test product",
    price: "100.00",
  });
  const tax = await ctx.repos.taxes.create({
    organizationId,
    name: "VAT",
    type: "PERCENTAGE",
    rate: "0.2100",
  });
  return { client, product, tax };
}

describeForEachAdapter("DocumentRepository", allFactories, (ctx) => {
  test("create with line items and taxes", async () => {
    const { organizationId } = await seed(ctx.repos);
    const { client, product, tax } = await setup(ctx, organizationId);

    const doc = await ctx.repos.documents.create({
      type: "INVOICE",
      organizationId,
      clientId: client.id,
      documentNumber: 1,
      documentNumberPrefix: "INV",
      issueDate: new Date("2026-01-15"),
      dueDate: new Date("2026-02-15"),
      notes: "Net 30",
      subtotal: 10000n,
      tax: 2100n,
      total: 12100n,
      lineItems: [
        {
          productId: product.id,
          quantity: "1.0000",
          price: 10000n,
          description: "Consulting",
          taxes: [{ taxId: tax.id, taxAmount: 2100n }],
          taxAmount: 2100n,
          total: 12100n,
        },
      ],
      paymentMethodIds: [],
    });

    expect(doc.id).toBeTruthy();
    expect(doc.documentNumber).toBe(1);
    expect(doc.lineItems).toHaveLength(1);
    expect(doc.lineItems[0]!.taxes).toHaveLength(1);
    expect(doc.lineItems[0]!.taxes[0]!.taxId).toBe(tax.id);
    expect(doc.subtotal).toBe(10000n);
    expect(doc.total).toBe(12100n);
  });

  test("findById returns the document with line items and taxes", async () => {
    const { organizationId } = await seed(ctx.repos);
    const { client, product } = await setup(ctx, organizationId);
    const created = await ctx.repos.documents.create({
      type: "INVOICE",
      organizationId,
      clientId: client.id,
      documentNumber: 1,
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
    const found = await ctx.repos.documents.findById(created.id, organizationId);
    expect(found).not.toBeNull();
    expect(found!.lineItems).toHaveLength(1);
  });

  test("findById is org-scoped", async () => {
    const a = await seed(ctx.repos);
    const b = await seed(ctx.repos);
    const { client, product } = await setup(ctx, a.organizationId);
    const created = await ctx.repos.documents.create({
      type: "INVOICE",
      organizationId: a.organizationId,
      clientId: client.id,
      documentNumber: 1,
      issueDate: new Date(),
      subtotal: 0n,
      tax: 0n,
      total: 0n,
      lineItems: [
        {
          productId: product.id,
          quantity: "1",
          price: 0n,
          taxes: [],
          taxAmount: 0n,
          total: 0n,
        },
      ],
    });
    expect(
      await ctx.repos.documents.findById(created.id, b.organizationId),
    ).toBeNull();
  });

  test("replaceLineItems swaps the line items wholesale", async () => {
    const { organizationId } = await seed(ctx.repos);
    const { client, product } = await setup(ctx, organizationId);
    const doc = await ctx.repos.documents.create({
      type: "INVOICE",
      organizationId,
      clientId: client.id,
      documentNumber: 1,
      issueDate: new Date(),
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
    await ctx.repos.documents.replaceLineItems(doc.id, organizationId, [
      {
        productId: product.id,
        quantity: "2",
        price: 100n,
        taxes: [],
        taxAmount: 0n,
        total: 200n,
      },
    ]);
    const updated = await ctx.repos.documents.findById(doc.id, organizationId);
    expect(updated!.lineItems).toHaveLength(1);
    expect(updated!.lineItems[0]!.quantity).toBe("2");
    expect(updated!.lineItems[0]!.total).toBe(200n);
  });

  test("update patches scalar fields", async () => {
    const { organizationId } = await seed(ctx.repos);
    const { client, product } = await setup(ctx, organizationId);
    const doc = await ctx.repos.documents.create({
      type: "INVOICE",
      organizationId,
      clientId: client.id,
      documentNumber: 1,
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
    const updated = await ctx.repos.documents.update(doc.id, organizationId, {
      notes: "Updated note",
      total: 150n,
    });
    expect(updated.notes).toBe("Updated note");
    expect(updated.total).toBe(150n);
  });

  test("create persists currency and round-trips it", async () => {
    const { organizationId } = await seed(ctx.repos);
    const { client, product } = await setup(ctx, organizationId);
    const doc = await ctx.repos.documents.create({
      type: "INVOICE",
      organizationId,
      clientId: client.id,
      documentNumber: 1,
      issueDate: new Date("2026-01-15"),
      currency: "DOP",
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
    expect(doc.currency).toBe("DOP");
    const found = await ctx.repos.documents.findById(doc.id, organizationId);
    expect(found!.currency).toBe("DOP");
  });

  test("create defaults currency to usd when omitted", async () => {
    const { organizationId } = await seed(ctx.repos);
    const { client, product } = await setup(ctx, organizationId);
    const doc = await ctx.repos.documents.create({
      type: "INVOICE",
      organizationId,
      clientId: client.id,
      documentNumber: 1,
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
    expect(doc.currency).toBe("usd");
  });

  test("delete cascades to line items", async () => {
    const { organizationId } = await seed(ctx.repos);
    const { client, product } = await setup(ctx, organizationId);
    const doc = await ctx.repos.documents.create({
      type: "INVOICE",
      organizationId,
      clientId: client.id,
      documentNumber: 1,
      issueDate: new Date(),
      subtotal: 0n,
      tax: 0n,
      total: 0n,
      lineItems: [
        {
          productId: product.id,
          quantity: "1",
          price: 0n,
          taxes: [],
          taxAmount: 0n,
          total: 0n,
        },
      ],
    });
    await ctx.repos.documents.delete(doc.id, organizationId);
    expect(await ctx.repos.documents.findById(doc.id, organizationId)).toBeNull();
  });

  test("line items carry the product projection (name + source link)", async () => {
    const { organizationId } = await seed(ctx.repos);
    const { client, product } = await setup(ctx, organizationId);
    const sourcedProduct = await ctx.repos.products.create({
      organizationId,
      name: "Sunset Catamaran Tour",
      price: "50.00",
      sourceType: "experience",
      sourceId: "42",
    });

    const doc = await ctx.repos.documents.create({
      type: "INVOICE",
      organizationId,
      clientId: client.id,
      documentNumber: 1,
      issueDate: new Date("2026-01-15"),
      subtotal: 15000n,
      tax: 0n,
      total: 15000n,
      lineItems: [
        {
          productId: sourcedProduct.id,
          quantity: "1",
          price: 5000n,
          taxes: [],
          taxAmount: 0n,
          total: 5000n,
        },
        {
          productId: product.id,
          quantity: "1",
          price: 10000n,
          taxes: [],
          taxAmount: 0n,
          total: 10000n,
        },
      ],
    });

    // Both on create() and findById(), each line exposes its product's
    // name/sourceType/sourceId so document reads can surface `source`.
    for (const document of [doc, (await ctx.repos.documents.findById(doc.id, organizationId))!]) {
      const sourcedLine = document.lineItems.find(
        (lineItem: any) => lineItem.productId === sourcedProduct.id,
      )!;
      expect(sourcedLine.product).toEqual({
        name: "Sunset Catamaran Tour",
        sourceType: "experience",
        sourceId: "42",
      });
      const plainLine = document.lineItems.find(
        (lineItem: any) => lineItem.productId === product.id,
      )!;
      expect(plainLine.product).toEqual({
        name: "Test product",
        sourceType: null,
        sourceId: null,
      });
    }
  });
});
