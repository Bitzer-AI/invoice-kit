import type { Client } from "../../types";
import type {
  ClientRepository,
  ClientUpdate,
  ListClientsArgs,
  NewClient,
  Page,
} from "../types";
import type { AnyPrismaClient, PrismaModelNames } from "./client-type";
import { clientRowToDomain } from "./mappers";

export function createPrismaClientRepository(
  prisma: AnyPrismaClient,
  modelNames: PrismaModelNames,
): ClientRepository {
  const db = (prisma as any)[modelNames.client];
  return {
    async create(data: NewClient): Promise<Client> {
      const row = await db.create({
        data: {
          organizationId: data.organizationId,
          name: data.name,
          email: data.email ?? null,
          phone: data.phone ?? null,
          country: data.country ?? null,
          addressLine1: data.addressLine1 ?? null,
          city: data.city ?? null,
          state: data.state ?? null,
          postalCode: data.postalCode ?? null,
        },
      });
      return clientRowToDomain(row);
    },
    async findById(id, organizationId) {
      const row = await db.findFirst({ where: { id, organizationId } });
      return row ? clientRowToDomain(row) : null;
    },
    async list(args: ListClientsArgs): Promise<Page<Client>> {
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
        data: rows.map(clientRowToDomain),
        pageInfo: {
          page,
          perPage,
          totalCount,
          pageCount: Math.max(1, Math.ceil(totalCount / perPage)),
        },
      };
    },
    async update(id, organizationId, patch: ClientUpdate) {
      // Prisma's `update` needs a unique `where`; `(id, organizationId)` isn't a
      // declared compound unique on this table, so use `updateMany` to apply the
      // org-scoped filter and re-fetch by id.
      const { count } = await db.updateMany({
        where: { id, organizationId },
        data: patch,
      });
      if (count === 0) throw new Error("client not found");
      const row = await db.findUnique({ where: { id } });
      return clientRowToDomain(row);
    },
    async delete(id, organizationId) {
      await db.deleteMany({ where: { id, organizationId } });
    },
  };
}
