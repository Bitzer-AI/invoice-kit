// tests/conformance/documents.test.ts
import { expect, test } from "vitest";
import { describeForEachAdapter } from "./harness";
import { allFactories } from "./adapters";
import { seed } from "./seed";
import { RoundingMode, TaxLevel, BaseTaxMethod, ExchangeRateSource } from "../../src/types";

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
        description: null,
        price: "50.00",
        currency: "usd",
        sourceType: "experience",
        sourceId: "42",
      });
      const plainLine = document.lineItems.find(
        (lineItem: any) => lineItem.productId === product.id,
      )!;
      expect(plainLine.product).toEqual({
        name: "Test product",
        description: null,
        price: "100.00",
        currency: "usd",
        sourceType: null,
        sourceId: null,
      });
    }
  });

  test("round-trips exchange rate, policy and base amounts", async () => {
    const { organizationId } = await seed(ctx.repos);
    const { client, product, tax } = await setup(ctx, organizationId);
    const doc = await ctx.repos.documents.create({
      type: "INVOICE",
      organizationId,
      clientId: client.id,
      documentNumber: 1,
      issueDate: new Date("2026-09-25"),
      currency: "usd",
      subtotal: 100_000n,
      tax: 18_000n,
      total: 118_000n,
      moneyPolicy: { rounding: "half_up", taxLevel: "document", baseTaxMethod: "recompute" },
      baseCurrency: "dop",
      exchangeRate: "59.347",
      exchangeRateDate: new Date("2026-09-25"),
      exchangeRateSource: "provider",
      baseSubtotal: 5_934_700n,
      baseTax: 1_068_246n,
      baseTotal: 7_002_946n,
      lineItems: [
        {
          productId: product.id,
          quantity: "1",
          price: 100_000n,
          currency: "usd",
          taxes: [{ taxId: tax.id, taxAmount: 18_000n, baseTaxAmount: 1_068_246n }],
          taxAmount: 18_000n,
          total: 118_000n,
          baseSubtotal: 5_934_700n,
        },
      ],
    });
    const found = await ctx.repos.documents.findById(doc.id, organizationId);
    expect(found!.exchangeRate).toBe("59.347");
    expect(found!.exchangeRateSource).toBe("provider");
    expect(found!.exchangeRateDate!.toISOString().slice(0, 10)).toBe("2026-09-25");
    expect(found!.moneyPolicy).toEqual({ rounding: "half_up", taxLevel: "document", baseTaxMethod: "recompute" });
    expect([found!.baseSubtotal, found!.baseTax, found!.baseTotal]).toEqual([5_934_700n, 1_068_246n, 7_002_946n]);
    expect(found!.lineItems[0]!.baseSubtotal).toBe(5_934_700n);
    expect(found!.lineItems[0]!.taxes[0]!.baseTaxAmount).toBe(1_068_246n);
  });

  test("round-trips very small exchange rates without exponent notation", async () => {
    const { organizationId } = await seed(ctx.repos);
    const { client, product } = await setup(ctx, organizationId);
    for (const [documentNumber, exchangeRate] of [[3, "0.00000001"], [4, "0.0000001"], [5, "0.00000123"]] as const) {
      const doc = await ctx.repos.documents.create({
        type: "INVOICE",
        organizationId,
        clientId: client.id,
        documentNumber,
        issueDate: new Date("2026-09-25"),
        currency: "vnd",
        subtotal: 100n,
        tax: 0n,
        total: 100n,
        baseCurrency: "usd",
        exchangeRate,
        exchangeRateDate: new Date("2026-09-25"),
        exchangeRateSource: ExchangeRateSource.Provider,
        lineItems: [
          { productId: product.id, quantity: "1", price: 100n, currency: "vnd", taxes: [], taxAmount: 0n, total: 100n },
        ],
      });
      const found = await ctx.repos.documents.findById(doc.id, organizationId);
      expect(found!.exchangeRate).toBe(exchangeRate);
    }
  });

  test("documents without exchange data read back null fields", async () => {
    const { organizationId } = await seed(ctx.repos);
    const { client, product } = await setup(ctx, organizationId);
    const doc = await ctx.repos.documents.create({
      type: "INVOICE",
      organizationId,
      clientId: client.id,
      documentNumber: 2,
      issueDate: new Date("2026-09-25"),
      subtotal: 100n,
      tax: 0n,
      total: 100n,
      lineItems: [
        { productId: product.id, quantity: "1", price: 100n, currency: "usd", taxes: [], taxAmount: 0n, total: 100n },
      ],
    });
    const found = await ctx.repos.documents.findById(doc.id, organizationId);
    expect(found!.moneyPolicy).toBeNull();
    expect(found!.exchangeRate).toBeNull();
    expect(found!.baseTotal).toBeNull();
    expect(found!.lineItems[0]!.baseSubtotal).toBeNull();
  });

  test("line items read back in insertion order after replaceLineItems", async () => {
    const { organizationId } = await seed(ctx.repos);
    const { client, product } = await setup(ctx, organizationId);
    const doc = await ctx.repos.documents.create({
      type: "INVOICE", organizationId, clientId: client.id, documentNumber: 3,
      issueDate: new Date("2026-09-25"), subtotal: 0n, tax: 0n, total: 0n, lineItems: [],
    });
    const prices = [30n, 10n, 20n, 50n, 40n];
    await ctx.repos.documents.replaceLineItems(
      doc.id,
      organizationId,
      prices.map((price) => ({ productId: product.id, quantity: "1", price, currency: "usd", taxes: [], taxAmount: 0n, total: price })),
    );
    const found = await ctx.repos.documents.findById(doc.id, organizationId);
    expect(found!.lineItems.map((line: { price: bigint }) => line.price)).toEqual(prices);
  });

  test("line items read back in insertion order after create with nested line items", async () => {
    const { organizationId } = await seed(ctx.repos);
    const { client, product } = await setup(ctx, organizationId);
    const prices = [30n, 10n, 20n, 50n, 40n];
    const doc = await ctx.repos.documents.create({
      type: "INVOICE",
      organizationId,
      clientId: client.id,
      documentNumber: 4,
      issueDate: new Date("2026-09-25"),
      subtotal: 0n,
      tax: 0n,
      total: 0n,
      lineItems: prices.map((price) => ({
        productId: product.id,
        quantity: "1",
        price,
        currency: "usd",
        taxes: [],
        taxAmount: 0n,
        total: price,
      })),
    });
    expect(doc.lineItems.map((line) => line.price)).toEqual(prices);
    const found = await ctx.repos.documents.findById(doc.id, organizationId);
    expect(found!.lineItems.map((line: { price: bigint }) => line.price)).toEqual(prices);
  });

  test("update sets exchange rate, policy and base amounts, then clears the clearable ones", async () => {
    const { organizationId } = await seed(ctx.repos);
    const { client, product } = await setup(ctx, organizationId);
    const doc = await ctx.repos.documents.create({
      type: "INVOICE",
      organizationId,
      clientId: client.id,
      documentNumber: 5,
      issueDate: new Date("2026-09-25"),
      subtotal: 100_000n,
      tax: 0n,
      total: 100_000n,
      lineItems: [
        { productId: product.id, quantity: "1", price: 100_000n, currency: "usd", taxes: [], taxAmount: 0n, total: 100_000n },
      ],
    });

    const moneyPolicy = {
      rounding: RoundingMode.HalfUp,
      taxLevel: TaxLevel.Document,
      baseTaxMethod: BaseTaxMethod.Recompute,
    };
    const updated = await ctx.repos.documents.update(doc.id, organizationId, {
      moneyPolicy,
      baseCurrency: "dop",
      exchangeRate: "59.34700000",
      exchangeRateDate: new Date("2026-09-25"),
      exchangeRateSource: ExchangeRateSource.Provider,
      baseSubtotal: 5_934_700n,
      baseTax: 0n,
      baseTotal: 5_934_700n,
    });
    expect(updated.moneyPolicy).toEqual(moneyPolicy);

    const found = await ctx.repos.documents.findById(doc.id, organizationId);
    expect(found!.moneyPolicy).toEqual(moneyPolicy);
    expect(found!.baseCurrency).toBe("dop");
    expect(found!.exchangeRate).toBe("59.347");
    expect(found!.exchangeRateDate!.toISOString().slice(0, 10)).toBe("2026-09-25");
    expect(found!.exchangeRateSource).toBe(ExchangeRateSource.Provider);
    expect(found!.baseSubtotal).toBe(5_934_700n);
    expect(found!.baseTax).toBe(0n);
    expect(found!.baseTotal).toBe(5_934_700n);

    await ctx.repos.documents.update(doc.id, organizationId, {
      exchangeRate: null,
      baseCurrency: null,
      exchangeRateDate: null,
      exchangeRateSource: null,
      baseSubtotal: null,
      baseTax: null,
      baseTotal: null,
    });
    const cleared = await ctx.repos.documents.findById(doc.id, organizationId);
    expect(cleared!.exchangeRate).toBeNull();
    expect(cleared!.baseCurrency).toBeNull();
    expect(cleared!.exchangeRateDate).toBeNull();
    expect(cleared!.exchangeRateSource).toBeNull();
    expect(cleared!.baseSubtotal).toBeNull();
    expect(cleared!.baseTax).toBeNull();
    expect(cleared!.baseTotal).toBeNull();
    expect(cleared!.moneyPolicy).toEqual(moneyPolicy);
  });
});
