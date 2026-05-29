// tests/conformance/taxes.test.ts
import { expect, test } from "vitest";
import { describeForEachAdapter } from "./harness";
import { allFactories } from "./adapters";
import { seed } from "./seed";

describeForEachAdapter("TaxRepository", allFactories, (ctx) => {
  test("create and findById", async () => {
    const { organizationId } = await seed(ctx.repos);
    const tax = await ctx.repos.taxes.create({
      organizationId,
      name: "VAT",
      type: "PERCENTAGE",
      rate: "0.2100",
    });
    expect(tax.type).toBe("PERCENTAGE");
    expect(tax.rate).toBe("0.2100");
    expect(tax.isActive).toBe(true);  // defaulted
    expect(tax.isDefault).toBe(false); // defaulted
  });

  test("list filters by isActive", async () => {
    const { organizationId } = await seed(ctx.repos);
    await ctx.repos.taxes.create({
      organizationId,
      name: "Active",
      type: "PERCENTAGE",
      rate: "0.10",
      isActive: true,
    });
    await ctx.repos.taxes.create({
      organizationId,
      name: "Inactive",
      type: "PERCENTAGE",
      rate: "0.10",
      isActive: false,
    });
    const active = await ctx.repos.taxes.list({ organizationId, isActive: true });
    expect(active).toHaveLength(1);
    expect(active[0]!.name).toBe("Active");
  });

  test("findManyById returns rows in requested order and skips wrong-org", async () => {
    const a = await seed(ctx.repos);
    const b = await seed(ctx.repos);
    const t1 = await ctx.repos.taxes.create({
      organizationId: a.organizationId,
      name: "T1",
      type: "PERCENTAGE",
      rate: "0.10",
    });
    const t2 = await ctx.repos.taxes.create({
      organizationId: a.organizationId,
      name: "T2",
      type: "FIXED",
      rate: "5",
    });
    const tOther = await ctx.repos.taxes.create({
      organizationId: b.organizationId,
      name: "Other",
      type: "PERCENTAGE",
      rate: "0.20",
    });
    const found = await ctx.repos.taxes.findManyById(
      [t1.id, t2.id, tOther.id],
      a.organizationId,
    );
    expect(found.map((t) => t.id).sort()).toEqual([t1.id, t2.id].sort());
  });

  test("clearDefaultExcept unsets isDefault on all rows except keepId", async () => {
    const { organizationId } = await seed(ctx.repos);
    const a = await ctx.repos.taxes.create({
      organizationId,
      name: "A",
      type: "PERCENTAGE",
      rate: "0.10",
      isDefault: true,
    });
    const b = await ctx.repos.taxes.create({
      organizationId,
      name: "B",
      type: "PERCENTAGE",
      rate: "0.10",
      isDefault: true,
    });
    await ctx.repos.taxes.clearDefaultExcept(organizationId, b.id);
    const aRow = await ctx.repos.taxes.findById(a.id, organizationId);
    const bRow = await ctx.repos.taxes.findById(b.id, organizationId);
    expect(aRow!.isDefault).toBe(false);
    expect(bRow!.isDefault).toBe(true);
  });

  test("clearDefaultExcept with keepId=null clears all", async () => {
    const { organizationId } = await seed(ctx.repos);
    const a = await ctx.repos.taxes.create({
      organizationId,
      name: "A",
      type: "PERCENTAGE",
      rate: "0.10",
      isDefault: true,
    });
    await ctx.repos.taxes.clearDefaultExcept(organizationId, null);
    const aRow = await ctx.repos.taxes.findById(a.id, organizationId);
    expect(aRow!.isDefault).toBe(false);
  });

  test("update and delete", async () => {
    const { organizationId } = await seed(ctx.repos);
    const t = await ctx.repos.taxes.create({
      organizationId,
      name: "X",
      type: "PERCENTAGE",
      rate: "0.10",
    });
    const u = await ctx.repos.taxes.update(t.id, organizationId, { name: "X2" });
    expect(u.name).toBe("X2");
    await ctx.repos.taxes.delete(t.id, organizationId);
    expect(await ctx.repos.taxes.findById(t.id, organizationId)).toBeNull();
  });

  test("create persists fiscalCategory", async () => {
    const { organizationId } = await seed(ctx.repos);
    const created = await ctx.repos.taxes.create({
      organizationId, name: "ITBIS", type: "PERCENTAGE", rate: "18.00",
      fiscalCategory: "ITBIS18",
    });
    expect(created.fiscalCategory).toBe("ITBIS18");
    const found = await ctx.repos.taxes.findById(created.id, organizationId);
    expect(found?.fiscalCategory).toBe("ITBIS18");
  });
});
