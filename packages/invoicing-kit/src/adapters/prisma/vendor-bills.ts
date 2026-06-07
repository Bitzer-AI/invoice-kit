import type { VendorBill } from "../../types";
import type {
  ListVendorBillsArgs,
  NewVendorBill,
  Page,
  VendorBillRepository,
  VendorBillUpdate,
  VendorBillWithDocument,
} from "../types";
import type { AnyPrismaClient, PrismaModelNames } from "./client-type";
import {
  vendorBillRowToDomain,
  vendorBillWithDocumentRowToDomain,
} from "./mappers";

const DOC_INCLUDE = {
  document: { include: { lineItems: { include: { taxes: true } }, paymentMethods: true } },
};

export function createPrismaVendorBillRepository(
  prisma: AnyPrismaClient,
  modelNames: PrismaModelNames,
): VendorBillRepository {
  const db = (prisma as any)[modelNames.vendorBill];
  return {
    async create(data: NewVendorBill): Promise<VendorBill> {
      const row = await db.create({ data: { documentId: data.documentId, status: data.status } });
      return vendorBillRowToDomain(row);
    },

    async findById(id, organizationId): Promise<VendorBillWithDocument | null> {
      const row = await db.findFirst({
        where: { id, document: { organizationId } },
        include: DOC_INCLUDE,
      });
      return row ? vendorBillWithDocumentRowToDomain(row) : null;
    },

    async list(args: ListVendorBillsArgs): Promise<Page<VendorBillWithDocument>> {
      const page = args.page ?? 1;
      const perPage = args.perPage ?? 20;
      const documentWhere: any = { organizationId: args.organizationId };
      if (args.vendorId) documentWhere.vendorId = args.vendorId;
      if (args.issueDateFrom || args.issueDateTo) {
        documentWhere.issueDate = {};
        if (args.issueDateFrom) documentWhere.issueDate.gte = args.issueDateFrom;
        if (args.issueDateTo) documentWhere.issueDate.lte = args.issueDateTo;
      }
      if (args.query) {
        documentWhere.externalDocumentNumber = { contains: args.query, mode: "insensitive" };
      }
      const where: any = { document: documentWhere };
      if (args.status) {
        where.status = Array.isArray(args.status) ? { in: args.status } : args.status;
      }
      const sortBy = args.sortBy ?? "issueDate";
      const sortDir = args.sortDir ?? "desc";
      const orderBy =
        sortBy === "status"
          ? { status: sortDir }
          : { document: { [sortBy]: sortDir } };
      const [rows, totalCount] = await Promise.all([
        db.findMany({
          where,
          include: DOC_INCLUDE,
          skip: (page - 1) * perPage,
          take: perPage,
          orderBy,
        }),
        db.count({ where }),
      ]);
      return {
        data: rows.map(vendorBillWithDocumentRowToDomain),
        pageInfo: {
          page,
          perPage,
          totalCount,
          pageCount: Math.max(1, Math.ceil(totalCount / perPage)),
        },
      };
    },

    async update(id, organizationId, patch: VendorBillUpdate): Promise<VendorBill> {
      const { count } = await db.updateMany({
        where: { id, document: { organizationId } },
        data: patch,
      });
      if (count === 0) throw new Error("vendor bill not found");
      const row = await db.findUnique({ where: { id } });
      return vendorBillRowToDomain(row);
    },

    async delete(id, organizationId): Promise<void> {
      await db.deleteMany({ where: { id, document: { organizationId } } });
    },
  };
}
