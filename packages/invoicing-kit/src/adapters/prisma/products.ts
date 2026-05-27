import type { Product } from "../../types";
import type {
  ListProductsArgs,
  NewProduct,
  Page,
  ProductRepository,
  ProductUpdate,
} from "../types";
import type { AnyPrismaClient } from "./client-type";
import { productRowToDomain } from "./mappers";

export function createPrismaProductRepository(
  prisma: AnyPrismaClient,
): ProductRepository {
  const db = prisma as any;
  return {
    async create(data: NewProduct): Promise<Product> {
      const row = await db.product.create({
        data: {
          organizationId: data.organizationId,
          name: data.name,
          description: data.description ?? null,
          price: data.price,
        },
      });
      return productRowToDomain(row);
    },
    async findById(id, organizationId) {
      const row = await db.product.findFirst({ where: { id, organizationId } });
      return row ? productRowToDomain(row) : null;
    },
    async list(args: ListProductsArgs): Promise<Page<Product>> {
      const page = args.page ?? 1;
      const perPage = args.perPage ?? 20;
      const where: any = { organizationId: args.organizationId };
      if (args.query) {
        where.name = { contains: args.query, mode: "insensitive" };
      }
      const [rows, totalCount] = await Promise.all([
        db.product.findMany({
          where,
          skip: (page - 1) * perPage,
          take: perPage,
          orderBy: { createdAt: "desc" },
        }),
        db.product.count({ where }),
      ]);
      return {
        data: rows.map(productRowToDomain),
        pageInfo: {
          page,
          perPage,
          totalCount,
          pageCount: Math.max(1, Math.ceil(totalCount / perPage)),
        },
      };
    },
    async update(id, organizationId, patch: ProductUpdate) {
      // Prisma's `update` needs a unique `where`; `(id, organizationId)` isn't a
      // declared compound unique on this table, so use `updateMany` to apply the
      // org-scoped filter and re-fetch by id.
      const { count } = await db.product.updateMany({
        where: { id, organizationId },
        data: patch,
      });
      if (count === 0) throw new Error("product not found");
      const row = await db.product.findUnique({ where: { id } });
      return productRowToDomain(row);
    },
    async delete(id, organizationId) {
      await db.product.deleteMany({ where: { id, organizationId } });
    },
  };
}
