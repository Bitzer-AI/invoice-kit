import { expect, test } from "vitest";
import { describeForEachAdapter } from "./harness";
import { allFactories } from "./adapters";
import { seed } from "./seed";

describeForEachAdapter("ClientRepository", allFactories, (ctx) => {
  test("create then findById returns the same client", async () => {
    const { organizationId } = await seed(ctx.repos);
    const created = await ctx.repos.clients.create({
      organizationId,
      name: "Acme Co",
      email: "billing@acme.test",
      country: "US",
      addressLine1: "1 Main St",
      city: "Springfield",
      state: "IL",
      postalCode: "62701",
    });
    expect(created.id).toBeTruthy();
    expect(created.organizationId).toBe(organizationId);
    expect(created.createdAt).toBeInstanceOf(Date);

    const found = await ctx.repos.clients.findById(created.id, organizationId);
    expect(found).toMatchObject({
      id: created.id,
      name: "Acme Co",
      email: "billing@acme.test",
      country: "US",
    });
  });

  test("findById returns null for missing id", async () => {
    const { organizationId } = await seed(ctx.repos);
    const found = await ctx.repos.clients.findById("missing", organizationId);
    expect(found).toBeNull();
  });

  test("findById is scoped by organizationId", async () => {
    const a = await seed(ctx.repos);
    const b = await seed(ctx.repos);
    const created = await ctx.repos.clients.create({
      organizationId: a.organizationId,
      name: "Org A Client",
    });
    const wrongOrg = await ctx.repos.clients.findById(created.id, b.organizationId);
    expect(wrongOrg).toBeNull();
  });

  test("list returns paginated results filtered by org and query", async () => {
    const { organizationId } = await seed(ctx.repos);
    for (let i = 0; i < 5; i++) {
      await ctx.repos.clients.create({ organizationId, name: `Client ${i}` });
    }
    await ctx.repos.clients.create({ organizationId, name: "Different Co" });

    const page1 = await ctx.repos.clients.list({ organizationId, page: 1, perPage: 3 });
    expect(page1.data).toHaveLength(3);
    expect(page1.pageInfo).toEqual({
      page: 1,
      perPage: 3,
      totalCount: 6,
      pageCount: 2,
    });

    const filtered = await ctx.repos.clients.list({ organizationId, query: "Client" });
    expect(filtered.data.length).toBe(5);
  });

  test("update applies a partial patch", async () => {
    const { organizationId } = await seed(ctx.repos);
    const c = await ctx.repos.clients.create({ organizationId, name: "Before" });
    const updated = await ctx.repos.clients.update(c.id, organizationId, {
      name: "After",
      email: "new@test.local",
    });
    expect(updated.name).toBe("After");
    expect(updated.email).toBe("new@test.local");
  });

  test("update is scoped by organizationId", async () => {
    const a = await seed(ctx.repos);
    const b = await seed(ctx.repos);
    const c = await ctx.repos.clients.create({
      organizationId: a.organizationId,
      name: "Org A",
    });
    await expect(
      ctx.repos.clients.update(c.id, b.organizationId, { name: "Hijacked" }),
    ).rejects.toThrow();
  });

  test("delete removes the client", async () => {
    const { organizationId } = await seed(ctx.repos);
    const c = await ctx.repos.clients.create({ organizationId, name: "DeleteMe" });
    await ctx.repos.clients.delete(c.id, organizationId);
    expect(await ctx.repos.clients.findById(c.id, organizationId)).toBeNull();
  });

  test("create persists taxId and taxIdType", async () => {
    const { organizationId } = await seed(ctx.repos);
    const created = await ctx.repos.clients.create({
      organizationId,
      name: "Negocio SRL",
      taxId: "130862346",
      taxIdType: "RNC",
    });
    expect(created.taxId).toBe("130862346");
    expect(created.taxIdType).toBe("RNC");
    const found = await ctx.repos.clients.findById(created.id, organizationId);
    expect(found).toMatchObject({ taxId: "130862346", taxIdType: "RNC" });
  });

  test("taxId and taxIdType default to null when omitted", async () => {
    const { organizationId } = await seed(ctx.repos);
    const created = await ctx.repos.clients.create({ organizationId, name: "Tourist" });
    expect(created.taxId).toBeNull();
    expect(created.taxIdType).toBeNull();
  });
});
