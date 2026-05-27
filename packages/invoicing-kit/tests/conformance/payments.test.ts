import { expect, test } from "vitest";
import { describeForEachAdapter } from "./harness";
import { allFactories } from "./adapters";
import { seed } from "./seed";

async function createInvoiceFixture(ctx: { repos: any }, organizationId: string) {
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
    documentNumber: 1,
    issueDate: new Date(),
    subtotal: 10000n,
    tax: 0n,
    total: 10000n,
    lineItems: [
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
  const invoice = await ctx.repos.invoices.create({
    documentId: document.id,
    status: "sent",
  });
  return { invoice };
}

describeForEachAdapter("PaymentRepository", allFactories, (ctx) => {
  test("create and findById round-trip", async () => {
    const { organizationId } = await seed(ctx.repos);
    const { invoice } = await createInvoiceFixture(ctx, organizationId);
    const created = await ctx.repos.payments.create({
      invoiceId: invoice.id,
      amount: 5000n,
      currency: "usd",
      status: "succeeded",
      provider: "MANUAL",
      paidAt: new Date("2026-02-01"),
      reference: "wire-1234",
    });
    expect(created.amount).toBe(5000n);
    const found = await ctx.repos.payments.findById(created.id, organizationId);
    expect(found).not.toBeNull();
    expect(found!.reference).toBe("wire-1234");
  });

  test("findById is org-scoped via invoice -> document chain", async () => {
    const a = await seed(ctx.repos);
    const b = await seed(ctx.repos);
    const { invoice } = await createInvoiceFixture(ctx, a.organizationId);
    const p = await ctx.repos.payments.create({
      invoiceId: invoice.id,
      amount: 100n,
      currency: "usd",
      status: "succeeded",
      provider: "MANUAL",
    });
    expect(await ctx.repos.payments.findById(p.id, b.organizationId)).toBeNull();
  });

  test("list filters by invoiceId and status", async () => {
    const { organizationId } = await seed(ctx.repos);
    const { invoice } = await createInvoiceFixture(ctx, organizationId);
    await ctx.repos.payments.create({
      invoiceId: invoice.id,
      amount: 100n,
      currency: "usd",
      status: "succeeded",
      provider: "MANUAL",
    });
    await ctx.repos.payments.create({
      invoiceId: invoice.id,
      amount: 50n,
      currency: "usd",
      status: "failed",
      provider: "MANUAL",
      failureReason: "insufficient_funds",
    });
    const succeeded = await ctx.repos.payments.list({
      organizationId,
      invoiceId: invoice.id,
      status: "succeeded",
    });
    expect(succeeded.data).toHaveLength(1);
    expect(succeeded.data[0]!.status).toBe("succeeded");
  });

  test("update patches status, paidAt, failureReason", async () => {
    const { organizationId } = await seed(ctx.repos);
    const { invoice } = await createInvoiceFixture(ctx, organizationId);
    const p = await ctx.repos.payments.create({
      invoiceId: invoice.id,
      amount: 100n,
      currency: "usd",
      status: "pending",
      provider: "MANUAL",
    });
    const u = await ctx.repos.payments.update(p.id, organizationId, {
      status: "succeeded",
      paidAt: new Date("2026-03-01"),
    });
    expect(u.status).toBe("succeeded");
    expect(u.paidAt).toBeInstanceOf(Date);
  });

  test("delete removes the row", async () => {
    const { organizationId } = await seed(ctx.repos);
    const { invoice } = await createInvoiceFixture(ctx, organizationId);
    const p = await ctx.repos.payments.create({
      invoiceId: invoice.id,
      amount: 100n,
      currency: "usd",
      status: "succeeded",
      provider: "MANUAL",
    });
    await ctx.repos.payments.delete(p.id, organizationId);
    expect(await ctx.repos.payments.findById(p.id, organizationId)).toBeNull();
  });

  test("totalPaidForInvoice sums only succeeded payments", async () => {
    const { organizationId } = await seed(ctx.repos);
    const { invoice } = await createInvoiceFixture(ctx, organizationId);
    await ctx.repos.payments.create({
      invoiceId: invoice.id,
      amount: 100n,
      currency: "usd",
      status: "succeeded",
      provider: "MANUAL",
    });
    await ctx.repos.payments.create({
      invoiceId: invoice.id,
      amount: 200n,
      currency: "usd",
      status: "succeeded",
      provider: "MANUAL",
    });
    await ctx.repos.payments.create({
      invoiceId: invoice.id,
      amount: 1000n,
      currency: "usd",
      status: "failed",
      provider: "MANUAL",
    });
    const total = await ctx.repos.payments.totalPaidForInvoice(
      invoice.id,
      organizationId,
    );
    expect(total).toBe(300n);
  });
});
