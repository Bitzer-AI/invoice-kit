// tests/conformance/transactions.test.ts
import { expect, test } from "vitest";
import { describeForEachAdapter } from "./harness";
import { allFactories } from "./adapters";
import { seed } from "./seed";

describeForEachAdapter("transactions", allFactories, (ctx) => {
  test("commits writes when fn resolves", async () => {
    const { organizationId } = await seed(ctx.repos);
    const id = await ctx.repos.tx(async (tx) => {
      const c = await tx.clients.create({ organizationId, name: "Tx commit" });
      return c.id;
    });
    expect(await ctx.repos.clients.findById(id, organizationId)).not.toBeNull();
  });

  test("rolls back writes when fn throws", async () => {
    const { organizationId } = await seed(ctx.repos);
    let createdId = "";
    await expect(
      ctx.repos.tx(async (tx) => {
        const c = await tx.clients.create({ organizationId, name: "Tx rollback" });
        createdId = c.id;
        throw new Error("intentional rollback");
      }),
    ).rejects.toThrow("intentional rollback");
    expect(await ctx.repos.clients.findById(createdId, organizationId)).toBeNull();
  });

  test("nested tx reuses outer transaction (writes from inner are visible to outer if outer commits)", async () => {
    const { organizationId } = await seed(ctx.repos);
    const id = await ctx.repos.tx(async (tx) => {
      return tx.tx(async (innerTx) => {
        const c = await innerTx.clients.create({
          organizationId,
          name: "Nested",
        });
        return c.id;
      });
    });
    expect(await ctx.repos.clients.findById(id, organizationId)).not.toBeNull();
  });
});
