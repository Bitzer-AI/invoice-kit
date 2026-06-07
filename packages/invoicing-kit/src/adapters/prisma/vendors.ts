import type { Vendor } from "../../types";
import type {
  ListVendorsArgs,
  NewVendor,
  Page,
  VendorRepository,
  VendorUpdate,
} from "../types";
import type { AnyPrismaClient, PrismaModelNames } from "./client-type";
import { vendorRowToDomain } from "./mappers";

export function createPrismaVendorRepository(
  prisma: AnyPrismaClient,
  modelNames: PrismaModelNames,
): VendorRepository {
  const db = (prisma as any)[modelNames.vendor];
  return {
    async create(data: NewVendor): Promise<Vendor> {
      const row = await db.create({
        data: {
          organizationId: data.organizationId,
          name: data.name,
          email: data.email ?? null,
          phone: data.phone ?? null,
          taxId: data.taxId ?? null,
          taxIdType: data.taxIdType ?? null,
          isActive: data.isActive ?? true,
        },
      });
      return vendorRowToDomain(row);
    },
    async findById(id, organizationId) {
      const row = await db.findFirst({ where: { id, organizationId } });
      return row ? vendorRowToDomain(row) : null;
    },
    async list(args: ListVendorsArgs): Promise<Page<Vendor>> {
      const page = args.page ?? 1;
      const perPage = args.perPage ?? 20;
      const where: any = { organizationId: args.organizationId };
      if (args.query) {
        where.name = { contains: args.query, mode: "insensitive" };
      }
      const [rows, totalCount] = await Promise.all([
        db.findMany({
          where,
          skip: (page - 1) * perPage,
          take: perPage,
          orderBy: { createdAt: "desc" },
        }),
        db.count({ where }),
      ]);
      return {
        data: rows.map(vendorRowToDomain),
        pageInfo: {
          page,
          perPage,
          totalCount,
          pageCount: Math.max(1, Math.ceil(totalCount / perPage)),
        },
      };
    },
    async update(id, organizationId, patch: VendorUpdate) {
      const { count } = await db.updateMany({ where: { id, organizationId }, data: patch });
      if (count === 0) throw new Error("vendor not found");
      const row = await db.findUnique({ where: { id } });
      return vendorRowToDomain(row);
    },
    async delete(id, organizationId) {
      await db.deleteMany({ where: { id, organizationId } });
    },
  };
}
