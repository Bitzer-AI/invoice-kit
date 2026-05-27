import { expect, test } from "vitest";
import { describeForEachAdapter } from "./harness";
import { allFactories } from "./adapters";
import { seed } from "./seed";

describeForEachAdapter("cross-adapter end-to-end", allFactories, (ctx) => {
  test("create invoice atomically across multiple repos", async () => {
    const { organizationId } = await seed(ctx.repos);

    const result = await ctx.repos.tx(async (tx) => {
      const client = await tx.clients.create({
        organizationId,
        name: "End-to-end client",
      });
      const product = await tx.products.create({
        organizationId,
        name: "Service",
        price: "200.00",
      });
      await tx.documentSequences.ensure({
        organizationId,
        documentType: "INVOICE",
      });
      const number = await tx.documentSequences.incrementAndGet({
        organizationId,
        documentType: "INVOICE",
      });
      const doc = await tx.documents.create({
        type: "INVOICE",
        organizationId,
        clientId: client.id,
        documentNumber: number,
        issueDate: new Date(),
        subtotal: 20000n,
        tax: 0n,
        total: 20000n,
        lineItems: [
          {
            productId: product.id,
            quantity: "1",
            price: 20000n,
            taxes: [],
            taxAmount: 0n,
            total: 20000n,
          },
        ],
      });
      return tx.invoices.create({
        documentId: doc.id,
        status: "draft",
      });
    });

    const found = await ctx.repos.invoices.findById(result.id, organizationId);
    expect(found).not.toBeNull();
    expect(found!.document.documentNumber).toBe(1);
    expect(found!.document.lineItems).toHaveLength(1);
  });

  test("rollback unwinds all multi-repo writes", async () => {
    const { organizationId } = await seed(ctx.repos);
    let createdClientId = "";

    await expect(
      ctx.repos.tx(async (tx) => {
        const c = await tx.clients.create({
          organizationId,
          name: "Will rollback",
        });
        createdClientId = c.id;
        await tx.products.create({
          organizationId,
          name: "P",
          price: "1.00",
        });
        throw new Error("rollback all");
      }),
    ).rejects.toThrow();

    expect(
      await ctx.repos.clients.findById(createdClientId, organizationId),
    ).toBeNull();
  });
});
