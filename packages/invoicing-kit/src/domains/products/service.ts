import type { Repositories, ListProductsArgs } from "../../adapters/types";
import type { AuthContext } from "../../auth/types";
import type { Product } from "../../types";
import { ProductUsage } from "../../types";
import { DEFAULT_CURRENCY } from "../../lib/currency";
import type { CreateProductBody, UpdateProductBody, ListProductsQuery } from "./validation";
import { ProductNotFoundException } from "./exceptions";

export class ProductService {
  constructor(private readonly repos: Repositories) {}

  async create(body: CreateProductBody, ctx: AuthContext): Promise<Product> {
    return this.repos.products.create({
      organizationId: ctx.organizationId,
      name: body.name,
      description: body.description ?? null,
      price: body.price,
      currency: body.currency ?? DEFAULT_CURRENCY,
      sourceType: body.sourceType ?? null,
      sourceId: body.sourceId ?? null,
      usage: body.usage ?? ProductUsage.Both,
      cost: body.cost ?? null,
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
    // Verify existence (and throw typed 404 instead of a generic Prisma error).
    await this.findById(id, ctx);
    return this.repos.products.update(id, ctx.organizationId, body);
  }

  async delete(id: string, ctx: AuthContext): Promise<void> {
    await this.findById(id, ctx);
    await this.repos.products.delete(id, ctx.organizationId);
  }
}
