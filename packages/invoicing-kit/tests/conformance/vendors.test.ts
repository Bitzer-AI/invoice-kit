// tests/conformance/vendors.test.ts
import { expect, test } from "vitest";
import { describeForEachAdapter } from "./harness";
import { allFactories } from "./adapters";
import { seed } from "./seed";

describeForEachAdapter("VendorRepository", allFactories, (ctx) => {
  test("create and findById round-trip", async () => {
    const { organizationId } = await seed(ctx.repos);
    const created = await ctx.repos.vendors.create({
      organizationId,
      name: "Acme Supplies",
      email: "billing@acme.test",
      taxId: "RNC-123",
      taxIdType: "RNC",
    });
    expect(created.name).toBe("Acme Supplies");
    expect(created.isActive).toBe(true);
    const found = await ctx.repos.vendors.findById(created.id, organizationId);
    expect(found).not.toBeNull();
    expect(found!.email).toBe("billing@acme.test");
    expect(found!.taxId).toBe("RNC-123");
  });

  test("findById is org-scoped (returns null for other org)", async () => {
    const a = await seed(ctx.repos);
    const b = await seed(ctx.repos);
    const v = await ctx.repos.vendors.create({
      organizationId: a.organizationId,
      name: "Org A Vendor",
    });
    expect(await ctx.repos.vendors.findById(v.id, b.organizationId)).toBeNull();
  });

  test("list filters by name query (case-insensitive)", async () => {
    const { organizationId } = await seed(ctx.repos);
    await ctx.repos.vendors.create({ organizationId, name: "Globex Logistics" });
    await ctx.repos.vendors.create({ organizationId, name: "Initech Hardware" });

    const match = await ctx.repos.vendors.list({ organizationId, query: "globex" });
    expect(match.data).toHaveLength(1);
    expect(match.data[0]!.name).toBe("Globex Logistics");

    const none = await ctx.repos.vendors.list({ organizationId, query: "zzz-no-match" });
    expect(none.data).toHaveLength(0);
  });

  test("list is org-scoped", async () => {
    const a = await seed(ctx.repos);
    const b = await seed(ctx.repos);
    await ctx.repos.vendors.create({ organizationId: a.organizationId, name: "A Vendor" });
    await ctx.repos.vendors.create({ organizationId: b.organizationId, name: "B Vendor" });

    const aList = await ctx.repos.vendors.list({ organizationId: a.organizationId });
    expect(aList.data).toHaveLength(1);
    expect(aList.data[0]!.name).toBe("A Vendor");
  });

  test("list paginates", async () => {
    const { organizationId } = await seed(ctx.repos);
    for (let i = 0; i < 5; i++) {
      await ctx.repos.vendors.create({ organizationId, name: `Vendor ${i}` });
    }
    const page1 = await ctx.repos.vendors.list({ organizationId, page: 1, perPage: 2 });
    expect(page1.data).toHaveLength(2);
    expect(page1.pageInfo.totalCount).toBe(5);
    expect(page1.pageInfo.pageCount).toBe(3);

    const page3 = await ctx.repos.vendors.list({ organizationId, page: 3, perPage: 2 });
    expect(page3.data).toHaveLength(1);
  });

  test("update patches fields", async () => {
    const { organizationId } = await seed(ctx.repos);
    const v = await ctx.repos.vendors.create({ organizationId, name: "Old Name" });
    const updated = await ctx.repos.vendors.update(v.id, organizationId, {
      name: "New Name",
      isActive: false,
    });
    expect(updated.name).toBe("New Name");
    expect(updated.isActive).toBe(false);
  });

  test("delete removes the row", async () => {
    const { organizationId } = await seed(ctx.repos);
    const v = await ctx.repos.vendors.create({ organizationId, name: "Doomed" });
    await ctx.repos.vendors.delete(v.id, organizationId);
    expect(await ctx.repos.vendors.findById(v.id, organizationId)).toBeNull();
  });
});
