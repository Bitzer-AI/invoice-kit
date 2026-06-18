import { test, expect, describe, beforeEach } from "vitest";
import { createStore } from "../../src/adapters/memory/store";
import { createInMemoryProductRepository } from "../../src/adapters/memory/products";
import { resolveLineItemProduct } from "../../src/lib/line-item";
import type { Repositories } from "../../src/adapters/types";

const organizationId = "org_1";

function setup() {
  const store = createStore();
  const products = createInMemoryProductRepository(store);
  const repos = { products } as unknown as Repositories;
  return { products, repos };
}

describe("product usage", () => {
  let ctx: ReturnType<typeof setup>;
  beforeEach(() => {
    ctx = setup();
  });

  test("create defaults usage to BOTH and cost to null", async () => {
    const product = await ctx.products.create({ organizationId, name: "A", price: "10.00" });
    expect(product.usage).toBe("BOTH");
    expect(product.cost).toBeNull();
  });

  test("list usage filter returns the side plus BOTH", async () => {
    await ctx.products.create({ organizationId, name: "Sell", price: "1.00", usage: "SALE" });
    await ctx.products.create({ organizationId, name: "Buy", price: "1.00", usage: "PURCHASE" });
    await ctx.products.create({ organizationId, name: "Either", price: "1.00", usage: "BOTH" });

    const purchasable = await ctx.products.list({ organizationId, usage: "PURCHASE" });
    expect(purchasable.data.map((p) => p.name).sort()).toEqual(["Buy", "Either"]);

    const sellable = await ctx.products.list({ organizationId, usage: "SALE" });
    expect(sellable.data.map((p) => p.name).sort()).toEqual(["Either", "Sell"]);

    const all = await ctx.products.list({ organizationId });
    expect(all.data).toHaveLength(3);
  });

  test("resolveLineItemProduct rejects a PURCHASE-only product on a sales line", async () => {
    const product = await ctx.products.create({
      organizationId,
      name: "Buy",
      price: "10.00",
      currency: "usd",
      usage: "PURCHASE",
    });
    await expect(
      resolveLineItemProduct(ctx.repos, organizationId, { productId: product.id, price: "1000" }, "usd", "SALE"),
    ).rejects.toThrow(/PRODUCT_NOT_SELLABLE/);
  });

  test("resolveLineItemProduct rejects a SALE-only product on a purchase line", async () => {
    const product = await ctx.products.create({
      organizationId,
      name: "Sell",
      price: "10.00",
      currency: "usd",
      usage: "SALE",
    });
    await expect(
      resolveLineItemProduct(ctx.repos, organizationId, { productId: product.id, price: "1000" }, "usd", "PURCHASE"),
    ).rejects.toThrow(/PRODUCT_NOT_PURCHASABLE/);
  });

  test("a BOTH product passes on either side", async () => {
    const product = await ctx.products.create({
      organizationId,
      name: "Either",
      price: "10.00",
      currency: "usd",
      usage: "BOTH",
    });
    await expect(
      resolveLineItemProduct(ctx.repos, organizationId, { productId: product.id, price: "1000" }, "usd", "SALE"),
    ).resolves.toMatchObject({ id: product.id });
    await expect(
      resolveLineItemProduct(ctx.repos, organizationId, { productId: product.id, price: "1000" }, "usd", "PURCHASE"),
    ).resolves.toMatchObject({ id: product.id });
  });

  test("a source line creates a product scoped to the side it was first used on", async () => {
    const source = { type: "experience", id: "exp_1", name: "City Tour" };
    const created = await resolveLineItemProduct(
      ctx.repos,
      organizationId,
      { source, price: "6500" },
      "usd",
      "SALE",
    );
    expect(created.usage).toBe("SALE");

    // The same source can no longer be billed as a purchase.
    await expect(
      resolveLineItemProduct(ctx.repos, organizationId, { source, price: "6500" }, "usd", "PURCHASE"),
    ).rejects.toThrow(/PRODUCT_NOT_PURCHASABLE/);
  });
});
