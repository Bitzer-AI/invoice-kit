import { expect, test } from "vitest";
import { describeForEachAdapter } from "./harness";
import { allFactories } from "./adapters";
import { seed } from "./seed";

describeForEachAdapter("ProductRepository", allFactories, (ctx) => {
  test("create stores Decimal price as string", async () => {
    const { organizationId } = await seed(ctx.repos);
    const created = await ctx.repos.products.create({
      organizationId,
      name: "Consulting hour",
      description: "Senior rate",
      price: "150.00",
    });
    expect(created.price).toBe("150.00");
    expect(typeof created.price).toBe("string");
  });

  test("findById is org-scoped", async () => {
    const a = await seed(ctx.repos);
    const b = await seed(ctx.repos);
    const created = await ctx.repos.products.create({
      organizationId: a.organizationId,
      name: "X",
      price: "10.00",
    });
    expect(await ctx.repos.products.findById(created.id, b.organizationId)).toBeNull();
  });

  test("list paginates", async () => {
    const { organizationId } = await seed(ctx.repos);
    for (let i = 0; i < 4; i++) {
      await ctx.repos.products.create({
        organizationId,
        name: `Product ${i}`,
        price: "1.00",
      });
    }
    const p1 = await ctx.repos.products.list({ organizationId, page: 1, perPage: 2 });
    expect(p1.data).toHaveLength(2);
    expect(p1.pageInfo.totalCount).toBe(4);
  });

  test("update patches name and price", async () => {
    const { organizationId } = await seed(ctx.repos);
    const c = await ctx.repos.products.create({
      organizationId,
      name: "Old",
      price: "5.00",
    });
    const u = await ctx.repos.products.update(c.id, organizationId, {
      name: "New",
      price: "9.99",
    });
    expect(u.name).toBe("New");
    expect(u.price).toBe("9.99");
  });

  test("delete removes the row", async () => {
    const { organizationId } = await seed(ctx.repos);
    const c = await ctx.repos.products.create({
      organizationId,
      name: "X",
      price: "1.00",
    });
    await ctx.repos.products.delete(c.id, organizationId);
    expect(await ctx.repos.products.findById(c.id, organizationId)).toBeNull();
  });

  test("create persists sourceType/sourceId", async () => {
    const { organizationId } = await seed(ctx.repos);
    const created = await ctx.repos.products.create({
      organizationId,
      name: "Sunset Tour",
      price: "50.00",
      sourceType: "experience",
      sourceId: "42",
    });
    expect(created.sourceType).toBe("experience");
    expect(created.sourceId).toBe("42");
  });

  test("findBySource returns the linked product, null otherwise", async () => {
    const { organizationId } = await seed(ctx.repos);
    expect(
      await ctx.repos.products.findBySource(organizationId, "experience", "42"),
    ).toBeNull();
    const created = await ctx.repos.products.create({
      organizationId,
      name: "Sunset Tour",
      price: "50.00",
      sourceType: "experience",
      sourceId: "42",
    });
    const found = await ctx.repos.products.findBySource(organizationId, "experience", "42");
    expect(found?.id).toBe(created.id);
  });

  test("findBySource is org-scoped", async () => {
    const a = await seed(ctx.repos);
    const b = await seed(ctx.repos);
    await ctx.repos.products.create({
      organizationId: a.organizationId,
      name: "Sunset Tour",
      price: "50.00",
      sourceType: "experience",
      sourceId: "42",
    });
    expect(
      await ctx.repos.products.findBySource(b.organizationId, "experience", "42"),
    ).toBeNull();
  });
});
