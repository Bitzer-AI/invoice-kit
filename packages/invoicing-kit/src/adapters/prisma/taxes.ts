import type { Tax } from "../../types";
import type {
  ListTaxesArgs,
  NewTax,
  TaxRepository,
  TaxUpdate,
} from "../types";
import type { AnyPrismaClient } from "./client-type";
import { taxRowToDomain } from "./mappers";

export function createPrismaTaxRepository(prisma: AnyPrismaClient): TaxRepository {
  const db = prisma as any;
  return {
    async create(data: NewTax): Promise<Tax> {
      const row = await db.tax.create({
        data: {
          organizationId: data.organizationId,
          name: data.name,
          description: data.description ?? null,
          type: data.type,
          rate: data.rate,
          isActive: data.isActive ?? true,
          isDefault: data.isDefault ?? false,
        },
      });
      return taxRowToDomain(row);
    },

    async findById(id: string, organizationId: string): Promise<Tax | null> {
      const row = await db.tax.findFirst({ where: { id, organizationId } });
      return row ? taxRowToDomain(row) : null;
    },

    async findManyById(ids: string[], organizationId: string): Promise<Tax[]> {
      const rows = await db.tax.findMany({
        where: { id: { in: ids }, organizationId },
      });
      return rows.map(taxRowToDomain);
    },

    async list(args: ListTaxesArgs): Promise<Tax[]> {
      const where: any = { organizationId: args.organizationId };
      if (args.isActive !== undefined) {
        where.isActive = args.isActive;
      }
      const rows = await db.tax.findMany({
        where,
        orderBy: { createdAt: "desc" },
      });
      return rows.map(taxRowToDomain);
    },

    async update(id: string, organizationId: string, patch: TaxUpdate): Promise<Tax> {
      const { count } = await db.tax.updateMany({
        where: { id, organizationId },
        data: patch,
      });
      if (count === 0) throw new Error("tax not found");
      const row = await db.tax.findUnique({ where: { id } });
      return taxRowToDomain(row);
    },

    async delete(id: string, organizationId: string): Promise<void> {
      await db.tax.deleteMany({ where: { id, organizationId } });
    },

    async clearDefaultExcept(organizationId: string, keepId: string | null): Promise<void> {
      await db.tax.updateMany({
        where: {
          organizationId,
          isDefault: true,
          ...(keepId ? { NOT: { id: keepId } } : {}),
        },
        data: { isDefault: false },
      });
    },
  };
}
