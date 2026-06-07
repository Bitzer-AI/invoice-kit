// tests/conformance/vendor-bill-payments.test.ts
import { expect, test } from "vitest";
import { describeForEachAdapter } from "./harness";
import { allFactories } from "./adapters";
import { seed } from "./seed";

async function createVendorBillFixture(
  ctx: { repos: any },
  organizationId: string,
  total = 100n,
) {
  const vendor = await ctx.repos.vendors.create({ organizationId, name: "Test vendor" });
  const product = await ctx.repos.products.create({
    organizationId,
    name: "Test product",
    price: "100.00",
  });
  const document = await ctx.repos.documents.create({
    type: "VENDOR_BILL",
    organizationId,
    vendorId: vendor.id,
    documentNumber: 1,
    documentNumberPrefix: null,
    issueDate: new Date("2026-01-15"),
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
    status: "received",
  });
  return { vendor, bill };
}

describeForEachAdapter("VendorBillPaymentRepository", allFactories, (ctx) => {
  test("create and findById round-trip", async () => {
    const { organizationId } = await seed(ctx.repos);
    const { bill } = await createVendorBillFixture(ctx, organizationId);
    const created = await ctx.repos.vendorBillPayments.create({
      organizationId,
      vendorBillId: bill.id,
      amount: 5000n,
      currency: "dop",
      status: "succeeded",
      provider: "MANUAL",
      paidAt: new Date("2026-02-01"),
      reference: "wire-1234",
    });
    expect(created.amount).toBe(5000n);
    const found = await ctx.repos.vendorBillPayments.findById(created.id, organizationId);
    expect(found).not.toBeNull();
    expect(found!.reference).toBe("wire-1234");
  });

  test("findById is org-scoped (returns null for other org)", async () => {
    const a = await seed(ctx.repos);
    const b = await seed(ctx.repos);
    const { bill } = await createVendorBillFixture(ctx, a.organizationId);
    const p = await ctx.repos.vendorBillPayments.create({
      organizationId: a.organizationId,
      vendorBillId: bill.id,
      amount: 100n,
      currency: "dop",
      status: "succeeded",
      provider: "MANUAL",
    });
    expect(
      await ctx.repos.vendorBillPayments.findById(p.id, b.organizationId),
    ).toBeNull();
  });

  test("list filters by vendorBillId and status", async () => {
    const { organizationId } = await seed(ctx.repos);
    const { bill } = await createVendorBillFixture(ctx, organizationId);
    await ctx.repos.vendorBillPayments.create({
      organizationId,
      vendorBillId: bill.id,
      amount: 100n,
      currency: "dop",
      status: "succeeded",
      provider: "MANUAL",
    });
    await ctx.repos.vendorBillPayments.create({
      organizationId,
      vendorBillId: bill.id,
      amount: 50n,
      currency: "dop",
      status: "failed",
      provider: "MANUAL",
    });

    const byBill = await ctx.repos.vendorBillPayments.list({
      organizationId,
      vendorBillId: bill.id,
    });
    expect(byBill.data).toHaveLength(2);

    const succeeded = await ctx.repos.vendorBillPayments.list({
      organizationId,
      vendorBillId: bill.id,
      status: "succeeded",
    });
    expect(succeeded.data).toHaveLength(1);
    expect(succeeded.data[0]!.status).toBe("succeeded");
  });

  test("list is org-scoped", async () => {
    const a = await seed(ctx.repos);
    const b = await seed(ctx.repos);
    const { bill } = await createVendorBillFixture(ctx, a.organizationId);
    await ctx.repos.vendorBillPayments.create({
      organizationId: a.organizationId,
      vendorBillId: bill.id,
      amount: 100n,
      currency: "dop",
      status: "succeeded",
      provider: "MANUAL",
    });
    const bList = await ctx.repos.vendorBillPayments.list({ organizationId: b.organizationId });
    expect(bList.data).toHaveLength(0);
  });

  test("list paginates", async () => {
    const { organizationId } = await seed(ctx.repos);
    const { bill } = await createVendorBillFixture(ctx, organizationId);
    for (let i = 0; i < 5; i++) {
      await ctx.repos.vendorBillPayments.create({
        organizationId,
        vendorBillId: bill.id,
        amount: 10n,
        currency: "dop",
        status: "succeeded",
        provider: "MANUAL",
      });
    }
    const page1 = await ctx.repos.vendorBillPayments.list({
      organizationId,
      page: 1,
      perPage: 2,
    });
    expect(page1.data).toHaveLength(2);
    expect(page1.pageInfo.totalCount).toBe(5);
    expect(page1.pageInfo.pageCount).toBe(3);
  });

  test("update patches status and paidAt", async () => {
    const { organizationId } = await seed(ctx.repos);
    const { bill } = await createVendorBillFixture(ctx, organizationId);
    const p = await ctx.repos.vendorBillPayments.create({
      organizationId,
      vendorBillId: bill.id,
      amount: 100n,
      currency: "dop",
      status: "succeeded",
      provider: "MANUAL",
    });
    const u = await ctx.repos.vendorBillPayments.update(p.id, organizationId, {
      status: "canceled",
      paidAt: new Date("2026-03-01"),
    });
    expect(u.status).toBe("canceled");
    expect(u.paidAt).toBeInstanceOf(Date);
  });

  test("delete removes the row", async () => {
    const { organizationId } = await seed(ctx.repos);
    const { bill } = await createVendorBillFixture(ctx, organizationId);
    const p = await ctx.repos.vendorBillPayments.create({
      organizationId,
      vendorBillId: bill.id,
      amount: 100n,
      currency: "dop",
      status: "succeeded",
      provider: "MANUAL",
    });
    await ctx.repos.vendorBillPayments.delete(p.id, organizationId);
    expect(await ctx.repos.vendorBillPayments.findById(p.id, organizationId)).toBeNull();
  });

  test("totalPaidForBill sums only succeeded payments (org-scoped)", async () => {
    const { organizationId } = await seed(ctx.repos);
    const { bill } = await createVendorBillFixture(ctx, organizationId);
    await ctx.repos.vendorBillPayments.create({
      organizationId,
      vendorBillId: bill.id,
      amount: 100n,
      currency: "dop",
      status: "succeeded",
      provider: "MANUAL",
    });
    await ctx.repos.vendorBillPayments.create({
      organizationId,
      vendorBillId: bill.id,
      amount: 200n,
      currency: "dop",
      status: "succeeded",
      provider: "MANUAL",
    });
    await ctx.repos.vendorBillPayments.create({
      organizationId,
      vendorBillId: bill.id,
      amount: 1000n,
      currency: "dop",
      status: "failed",
      provider: "MANUAL",
    });
    const total = await ctx.repos.vendorBillPayments.totalPaidForBill(bill.id, organizationId);
    expect(total).toBe(300n);

    // Other org sees nothing for this bill.
    const other = await seed(ctx.repos);
    expect(
      await ctx.repos.vendorBillPayments.totalPaidForBill(bill.id, other.organizationId),
    ).toBe(0n);
  });
});
