import type { Repositories, ListProductsArgs, ProductUpdate } from "../../adapters/types";
import type { AuthContext } from "../../auth/types";
import type { Product } from "../../types";
import { ProductUsage } from "../../types";
import { DEFAULT_CURRENCY } from "../../lib/currency";
import type { CreateProductBody, UpdateProductBody, ListProductsQuery } from "./validation";
import { ProductNotFoundException } from "./exceptions";
import { catalogCostInCurrency, catalogPriceInCurrency } from "./catalog-price";

export class ProductService {
  constructor(private readonly repos: Repositories) {}

  async create(body: CreateProductBody, ctx: AuthContext): Promise<Product> {
    const currency = body.currency ?? DEFAULT_CURRENCY;
    return this.repos.products.create({
      organizationId: ctx.organizationId,
      name: body.name,
      description: body.description ?? null,
      price: catalogPriceInCurrency(body.price, currency),
      currency,
      sourceType: body.sourceType ?? null,
      sourceId: body.sourceId ?? null,
      usage: body.usage ?? ProductUsage.Both,
      cost: catalogCostInCurrency(body.cost ?? null, currency),
    });
  }

  async list(query: ListProductsQuery, ctx: AuthContext) {
    const args: ListProductsArgs = {
      organizationId: ctx.organizationId,
      page: query.page,
      perPage: query.perPage,
      query: query.query,
      usage: query.usage,
    };
    return this.repos.products.list(args);
  }

  async findById(id: string, ctx: AuthContext): Promise<Product> {
    const product = await this.repos.products.findById(id, ctx.organizationId);
    if (!product) throw ProductNotFoundException();
    return product;
  }

  async update(id: string, body: UpdateProductBody, ctx: AuthContext): Promise<Product> {
    const existing = await this.findById(id, ctx);
    const patch: ProductUpdate = { ...body };
    const currency = body.currency ?? existing.currency;
    if (body.price !== undefined || body.currency !== undefined) {
      patch.price = catalogPriceInCurrency(body.price ?? existing.price, currency);
    }
    if (body.cost !== undefined || body.currency !== undefined) {
      patch.cost = catalogCostInCurrency(body.cost === undefined ? existing.cost : body.cost, currency);
    }
    return this.repos.products.update(id, ctx.organizationId, patch);
  }

  async delete(id: string, ctx: AuthContext): Promise<void> {
    await this.findById(id, ctx);
    await this.repos.products.delete(id, ctx.organizationId);
  }
}
