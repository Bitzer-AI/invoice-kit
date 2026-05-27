import { expect, test } from "vitest";
import { describeForEachAdapter } from "./harness";
import { allFactories } from "./adapters";
import { seed } from "./seed";

describeForEachAdapter("PaymentMethodRepository", allFactories, (ctx) => {
  test("create applies defaults", async () => {
    const { organizationId } = await seed(ctx.repos);
    const pm = await ctx.repos.paymentMethods.create({
      organizationId,
      name: "Bank transfer",
      type: "MANUAL",
    });
    expect(pm.isActive).toBe(true);
    expect(pm.isDefault).toBe(false);
    expect(pm.instructions).toBeNull();
    expect(pm.metadata).toBeNull();
  });

  test("metadata round-trips arbitrary JSON", async () => {
    const { organizationId } = await seed(ctx.repos);
    const md = { stripeAccountId: "acct_123", nested: { k: 1 } };
    const pm = await ctx.repos.paymentMethods.create({
      organizationId,
      name: "Stripe",
      type: "STRIPE",
      metadata: md,
    });
    const found = await ctx.repos.paymentMethods.findById(pm.id, organizationId);
    expect(found!.metadata).toEqual(md);
  });

  test("list filters by isActive", async () => {
    const { organizationId } = await seed(ctx.repos);
    await ctx.repos.paymentMethods.create({
      organizationId,
      name: "Active",
      type: "MANUAL",
      isActive: true,
    });
    await ctx.repos.paymentMethods.create({
      organizationId,
      name: "Inactive",
      type: "MANUAL",
      isActive: false,
    });
    const active = await ctx.repos.paymentMethods.list({
      organizationId,
      isActive: true,
    });
    expect(active).toHaveLength(1);
    expect(active[0]!.name).toBe("Active");
  });

  test("update patches name and instructions", async () => {
    const { organizationId } = await seed(ctx.repos);
    const pm = await ctx.repos.paymentMethods.create({
      organizationId,
      name: "Old",
      type: "MANUAL",
    });
    const u = await ctx.repos.paymentMethods.update(pm.id, organizationId, {
      name: "New",
      instructions: "Wire to acct 123",
    });
    expect(u.name).toBe("New");
    expect(u.instructions).toBe("Wire to acct 123");
  });

  test("clearDefaultExcept unsets isDefault on all rows except keepId", async () => {
    const { organizationId } = await seed(ctx.repos);
    const a = await ctx.repos.paymentMethods.create({
      organizationId,
      name: "A",
      type: "MANUAL",
      isDefault: true,
    });
    const b = await ctx.repos.paymentMethods.create({
      organizationId,
      name: "B",
      type: "MANUAL",
      isDefault: true,
    });
    await ctx.repos.paymentMethods.clearDefaultExcept(organizationId, b.id);
    const aRow = await ctx.repos.paymentMethods.findById(a.id, organizationId);
    const bRow = await ctx.repos.paymentMethods.findById(b.id, organizationId);
    expect(aRow!.isDefault).toBe(false);
    expect(bRow!.isDefault).toBe(true);
  });

  test("delete removes the row", async () => {
    const { organizationId } = await seed(ctx.repos);
    const pm = await ctx.repos.paymentMethods.create({
      organizationId,
      name: "X",
      type: "MANUAL",
    });
    await ctx.repos.paymentMethods.delete(pm.id, organizationId);
    expect(
      await ctx.repos.paymentMethods.findById(pm.id, organizationId),
    ).toBeNull();
  });
});
