// tests/conformance/vendor-bills.test.ts
import { expect, test } from "vitest";
import { describeForEachAdapter } from "./harness";
import { allFactories } from "./adapters";
import { seed } from "./seed";

async function createVendorBillFixture(
  ctx: { repos: any },
  organizationId: string,
  overrides: Partial<{
    vendorId: string;
    vendorName: string;
    status: "draft" | "received" | "partially_paid" | "paid";
    externalDocumentNumber: string | null;
    issueDate: Date;
    total: bigint;
  }> = {},
) {
  const vendorId =
    overrides.vendorId ??
    (
      await ctx.repos.vendors.create({
        organizationId,
        name: overrides.vendorName ?? "Test vendor",
      })
    ).id;
  const product = await ctx.repos.products.create({
    organizationId,
    name: "Test product",
    price: "100.00",
  });
  const total = overrides.total ?? 100n;
  const document = await ctx.repos.documents.create({
    type: "VENDOR_BILL",
    organizationId,
    vendorId,
    externalDocumentNumber: overrides.externalDocumentNumber ?? null,
    documentNumber: 1,
    documentNumberPrefix: null,
    issueDate: overrides.issueDate ?? new Date("2026-01-15"),
    subtotal: total,
    tax: 0n,
    total,
    lineItems: [
      {
        productId: product.id,
        quantity: "1",
        price: total,
        taxes: [],
        taxAmount: 0n,
        total,
      },
    ],
  });
  const bill = await ctx.repos.vendorBills.create({
    documentId: document.id,
    status: overrides.status ?? "draft",
  });
  return { vendorId, product, document, bill };
}

describeForEachAdapter("VendorBillRepository", allFactories, (ctx) => {
  test("create and findById returns bill with document + line items", async () => {
    const { organizationId } = await seed(ctx.repos);
    const { bill, vendorId } = await createVendorBillFixture(ctx, organizationId);
    const found = await ctx.repos.vendorBills.findById(bill.id, organizationId);
    expect(found).not.toBeNull();
    expect(found!.status).toBe("draft");
    expect(found!.document.vendorId).toBe(vendorId);
    expect(found!.document.lineItems).toHaveLength(1);
  });

  test("findById is org-scoped (returns null for other org)", async () => {
    const a = await seed(ctx.repos);
    const b = await seed(ctx.repos);
    const { bill } = await createVendorBillFixture(ctx, a.organizationId);
    expect(await ctx.repos.vendorBills.findById(bill.id, b.organizationId)).toBeNull();
  });

  test("list filters by status", async () => {
    const { organizationId } = await seed(ctx.repos);
    await createVendorBillFixture(ctx, organizationId, { status: "draft" });
    await createVendorBillFixture(ctx, organizationId, { status: "paid" });

    const drafts = await ctx.repos.vendorBills.list({ organizationId, status: "draft" });
    expect(drafts.data).toHaveLength(1);
    expect(drafts.data[0]!.status).toBe("draft");
  });

  test("list filters by vendorId", async () => {
    const { organizationId } = await seed(ctx.repos);
    const v1 = await ctx.repos.vendors.create({ organizationId, name: "Vendor One" });
    const v2 = await ctx.repos.vendors.create({ organizationId, name: "Vendor Two" });
    await createVendorBillFixture(ctx, organizationId, { vendorId: v1.id });
    await createVendorBillFixture(ctx, organizationId, { vendorId: v2.id });

    const byVendor = await ctx.repos.vendorBills.list({ organizationId, vendorId: v1.id });
    expect(byVendor.data).toHaveLength(1);
    expect(byVendor.data[0]!.document.vendorId).toBe(v1.id);
  });

  test("list filters by issue date range", async () => {
    const { organizationId } = await seed(ctx.repos);
    await createVendorBillFixture(ctx, organizationId, {
      issueDate: new Date("2026-01-15"),
    });
    const within = await ctx.repos.vendorBills.list({
      organizationId,
      issueDateFrom: new Date("2026-01-01"),
      issueDateTo: new Date("2026-01-31"),
    });
    expect(within.data).toHaveLength(1);
    const outside = await ctx.repos.vendorBills.list({
      organizationId,
      issueDateFrom: new Date("2027-01-01"),
    });
    expect(outside.data).toHaveLength(0);
  });

  test("list searches by externalDocumentNumber (not vendor name)", async () => {
    const { organizationId } = await seed(ctx.repos);
    await createVendorBillFixture(ctx, organizationId, {
      vendorName: "Acme Corp",
      externalDocumentNumber: "B0100000001",
    });
    await createVendorBillFixture(ctx, organizationId, {
      vendorName: "Globex",
      externalDocumentNumber: "B0100000002",
    });

    const byExternal = await ctx.repos.vendorBills.list({
      organizationId,
      query: "B0100000001",
    });
    expect(byExternal.data).toHaveLength(1);
    expect(byExternal.data[0]!.document.externalDocumentNumber).toBe("B0100000001");

    // Vendor name is intentionally NOT searched for vendor bills.
    const byVendorName = await ctx.repos.vendorBills.list({ organizationId, query: "acme" });
    expect(byVendorName.data).toHaveLength(0);
  });

  test("list default sort is issueDate desc", async () => {
    const { organizationId } = await seed(ctx.repos);
    await createVendorBillFixture(ctx, organizationId, { issueDate: new Date("2026-01-10") });
    await createVendorBillFixture(ctx, organizationId, { issueDate: new Date("2026-03-10") });
    await createVendorBillFixture(ctx, organizationId, { issueDate: new Date("2026-02-10") });

    const listed = await ctx.repos.vendorBills.list({ organizationId });
    expect(listed.data.map((b: any) => b.document.issueDate.toISOString())).toEqual([
      new Date("2026-03-10").toISOString(),
      new Date("2026-02-10").toISOString(),
      new Date("2026-01-10").toISOString(),
    ]);
  });

  test("list sorts by issueDate asc", async () => {
    const { organizationId } = await seed(ctx.repos);
    await createVendorBillFixture(ctx, organizationId, { issueDate: new Date("2026-03-10") });
    await createVendorBillFixture(ctx, organizationId, { issueDate: new Date("2026-01-10") });
    await createVendorBillFixture(ctx, organizationId, { issueDate: new Date("2026-02-10") });

    const asc = await ctx.repos.vendorBills.list({
      organizationId,
      sortBy: "issueDate",
      sortDir: "asc",
    });
    expect(asc.data.map((b: any) => b.document.issueDate.toISOString())).toEqual([
      new Date("2026-01-10").toISOString(),
      new Date("2026-02-10").toISOString(),
      new Date("2026-03-10").toISOString(),
    ]);
  });

  test("list paginates", async () => {
    const { organizationId } = await seed(ctx.repos);
    for (let i = 0; i < 5; i++) {
      await createVendorBillFixture(ctx, organizationId, {
        issueDate: new Date(`2026-0${i + 1}-01`),
      });
    }
    const page1 = await ctx.repos.vendorBills.list({ organizationId, page: 1, perPage: 2 });
    expect(page1.data).toHaveLength(2);
    expect(page1.pageInfo.totalCount).toBe(5);
    expect(page1.pageInfo.pageCount).toBe(3);
  });

  test("update patches status", async () => {
    const { organizationId } = await seed(ctx.repos);
    const { bill } = await createVendorBillFixture(ctx, organizationId, { status: "received" });
    const updated = await ctx.repos.vendorBills.update(bill.id, organizationId, {
      status: "paid",
    });
    expect(updated.status).toBe("paid");
  });

  test("delete removes the bill", async () => {
    const { organizationId } = await seed(ctx.repos);
    const { bill } = await createVendorBillFixture(ctx, organizationId);
    await ctx.repos.vendorBills.delete(bill.id, organizationId);
    expect(await ctx.repos.vendorBills.findById(bill.id, organizationId)).toBeNull();
  });
});
