import { expect, test } from "vitest";
import { describeForEachAdapter } from "./harness";
import { allFactories } from "./adapters";
import { seed } from "./seed";
import { DocumentNumberingService } from "../../src/lib/numbering";
import { NumberingService } from "../../src/domains/numbering/service";
import type { AuthContext } from "../../src/auth/types";

async function createDocument(
  repos: any,
  organizationId: string,
  type: "INVOICE" | "QUOTE",
  documentNumber: number,
  documentNumberPrefix: string | null = null,
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
    documentNumberPrefix,
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

const authCtx = (organizationId: string): AuthContext => ({
  userId: "test-user",
  organizationId,
  role: "owner",
});

describeForEachAdapter("DocumentSequenceRepository", allFactories, (ctx) => {
  test("upsert creates then updates nextNumber/padWidth for a series", async () => {
    const { organizationId } = await seed(ctx.repos);

    await ctx.repos.documentSequences.upsert({
      organizationId,
      documentType: "INVOICE",
      prefix: "FAC-",
      nextNumber: 1000,
      padWidth: 6,
    });
    let row = await ctx.repos.documentSequences.find({
      organizationId,
      documentType: "INVOICE",
      prefix: "FAC-",
    });
    expect(row?.prefix).toBe("FAC-");
    expect(row?.nextNumber).toBe(1000);
    expect(row?.padWidth).toBe(6);

    await ctx.repos.documentSequences.upsert({
      organizationId,
      documentType: "INVOICE",
      prefix: "FAC-",
      nextNumber: 2000,
      padWidth: 4,
    });
    row = await ctx.repos.documentSequences.find({
      organizationId,
      documentType: "INVOICE",
      prefix: "FAC-",
    });
    expect(row?.prefix).toBe("FAC-");
    expect(row?.nextNumber).toBe(2000);
    expect(row?.padWidth).toBe(4);
  });

  test("maxIssuedNumber returns null with no documents", async () => {
    const { organizationId } = await seed(ctx.repos);
    expect(
      await ctx.repos.documentSequences.maxIssuedNumber({
        organizationId,
        documentType: "INVOICE",
        prefix: "",
      }),
    ).toBeNull();
  });

  test("maxIssuedNumber returns the max for (org, type, series), ignoring other types/orgs/series", async () => {
    const a = await seed(ctx.repos);
    const b = await seed(ctx.repos);

    await createDocument(ctx.repos, a.organizationId, "INVOICE", 5);
    await createDocument(ctx.repos, a.organizationId, "INVOICE", 12);
    // Excluded: a QUOTE with a higher number for the same org.
    await createDocument(ctx.repos, a.organizationId, "QUOTE", 99);
    // Excluded: an INVOICE with a higher number for a different org.
    await createDocument(ctx.repos, b.organizationId, "INVOICE", 100);
    // Excluded: an INVOICE with a higher number in a different series.
    await createDocument(ctx.repos, a.organizationId, "INVOICE", 200, "B02");

    expect(
      await ctx.repos.documentSequences.maxIssuedNumber({
        organizationId: a.organizationId,
        documentType: "INVOICE",
        prefix: "",
      }),
    ).toBe(12);
  });

  test("maxIssuedNumber for the default series matches null OR \"\" document prefixes", async () => {
    const { organizationId } = await seed(ctx.repos);
    await createDocument(ctx.repos, organizationId, "INVOICE", 7, null);
    await createDocument(ctx.repos, organizationId, "INVOICE", 9, "");

    expect(
      await ctx.repos.documentSequences.maxIssuedNumber({
        organizationId,
        documentType: "INVOICE",
        prefix: "",
      }),
    ).toBe(9);
    // null and "" address the same default series.
    expect(
      await ctx.repos.documentSequences.maxIssuedNumber({
        organizationId,
        documentType: "INVOICE",
        prefix: null,
      }),
    ).toBe(9);
  });

  test("ensure defaults padWidth to null", async () => {
    const { organizationId } = await seed(ctx.repos);
    await ctx.repos.documentSequences.ensure({ organizationId, documentType: "QUOTE", prefix: "" });
    const row = await ctx.repos.documentSequences.find({
      organizationId,
      documentType: "QUOTE",
      prefix: "",
    });
    expect(row?.padWidth).toBeNull();
    expect(row?.nextNumber).toBe(1);
  });

  test("series independence: B01 and B02 advance independently", async () => {
    const { organizationId } = await seed(ctx.repos);
    const numbering = new DocumentNumberingService();

    const b01a = await numbering.next(ctx.repos, organizationId, "INVOICE", "B01");
    const b02a = await numbering.next(ctx.repos, organizationId, "INVOICE", "B02");
    const b01b = await numbering.next(ctx.repos, organizationId, "INVOICE", "B01");

    expect(b01a).toBe(1);
    expect(b02a).toBe(1);
    expect(b01b).toBe(2);
  });

  test("null and \"\" address the same default series counter", async () => {
    const { organizationId } = await seed(ctx.repos);
    const numbering = new DocumentNumberingService();

    const first = await numbering.next(ctx.repos, organizationId, "QUOTE", null);
    const second = await numbering.next(ctx.repos, organizationId, "QUOTE", "");

    expect(first).toBe(1);
    expect(second).toBe(2);
  });

  test("service.list returns all series for a type, excluding other types", async () => {
    const { organizationId } = await seed(ctx.repos);
    const service = new NumberingService(ctx.repos);
    const c = authCtx(organizationId);

    await service.upsert({ documentType: "INVOICE", prefix: "B01", nextNumber: 1 }, c);
    await service.upsert({ documentType: "INVOICE", prefix: "B02", nextNumber: 1 }, c);
    await service.upsert({ documentType: "QUOTE", prefix: "COT", nextNumber: 1 }, c);

    const list = await service.list("INVOICE", c);
    const prefixes = list.map((s) => s.prefix).sort();
    expect(prefixes).toEqual(["B01", "B02"]);
  });

  test("service.get seeds the suggestion from the per-series max", async () => {
    const { organizationId } = await seed(ctx.repos);
    const service = new NumberingService(ctx.repos);
    const c = authCtx(organizationId);

    await createDocument(ctx.repos, organizationId, "INVOICE", 50, "B01");
    await createDocument(ctx.repos, organizationId, "INVOICE", 99, "B02");

    const b01 = await service.get("INVOICE", "B01", c);
    expect(b01).toMatchObject({ prefix: "B01", nextNumber: 51, padWidth: null });

    const b02 = await service.get("INVOICE", "B02", c);
    expect(b02).toMatchObject({ prefix: "B02", nextNumber: 100, padWidth: null });
  });

  test("service.upsert guard is per-series", async () => {
    const { organizationId } = await seed(ctx.repos);
    const service = new NumberingService(ctx.repos);
    const c = authCtx(organizationId);

    await createDocument(ctx.repos, organizationId, "INVOICE", 50, "B01");

    await expect(
      service.upsert({ documentType: "INVOICE", prefix: "B01", nextNumber: 50 }, c),
    ).rejects.toThrow();

    const ok = await service.upsert({ documentType: "INVOICE", prefix: "B01", nextNumber: 51 }, c);
    expect(ok).toMatchObject({ prefix: "B01", nextNumber: 51 });

    // B02 has no issued documents, so it is unaffected by B01's max.
    const b02 = await service.upsert({ documentType: "INVOICE", prefix: "B02", nextNumber: 1 }, c);
    expect(b02).toMatchObject({ prefix: "B02", nextNumber: 1 });
  });

  test("service.upsert persists an optional label, returned by get and list", async () => {
    const { organizationId } = await seed(ctx.repos);
    const service = new NumberingService(ctx.repos);
    const c = authCtx(organizationId);

    const saved = await service.upsert(
      { documentType: "INVOICE", prefix: "B02", label: "Consumidor Final", nextNumber: 1 },
      c,
    );
    expect(saved).toMatchObject({ prefix: "B02", label: "Consumidor Final" });

    const got = await service.get("INVOICE", "B02", c);
    expect(got.label).toBe("Consumidor Final");

    const list = await service.list("INVOICE", c);
    expect(list.find((s) => s.prefix === "B02")?.label).toBe("Consumidor Final");

    // Suggestion for an unconfigured series has a null label.
    const suggestion = await service.get("INVOICE", "B99", c);
    expect(suggestion.label).toBeNull();
  });
});
