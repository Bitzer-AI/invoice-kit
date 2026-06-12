import type {
  InvoiceRepository,
  InvoiceUpdate,
  InvoiceWithDocument,
  ListInvoicesArgs,
  NewInvoice,
  Page,
} from "../types";
import type { Invoice } from "../../types";
import type { AnyPrismaClient, PrismaModelNames } from "./client-type";
import {
  invoiceRowToDomain,
  invoiceWithDocumentRowToDomain,
} from "./mappers";
import { WITH_DOCUMENT_INCLUDE } from "./documents";
import { documentSearchWhere, invoiceListOrderBy } from "../../lib/list-query";

export function createPrismaInvoiceRepository(
  prisma: AnyPrismaClient,
  modelNames: PrismaModelNames,
): InvoiceRepository {
  const db = (prisma as any)[modelNames.invoice];
  return {
    async create(data: NewInvoice): Promise<Invoice> {
      const row = await db.create({
        data: {
          documentId: data.documentId,
          status: data.status,
          paidDate: data.paidDate ?? null,
          convertedFromQuoteId: data.convertedFromQuoteId ?? null,
        },
      });
      return invoiceRowToDomain(row);
    },

    async findById(id: string, organizationId: string): Promise<InvoiceWithDocument | null> {
      const row = await db.findFirst({
        where: { id, document: { organizationId } },
        include: WITH_DOCUMENT_INCLUDE,
      });
      return row ? invoiceWithDocumentRowToDomain(row) : null;
    },

    async findByDocumentNumber({
      organizationId,
      prefix,
      documentNumber,
    }: {
      organizationId: string;
      prefix: string | null;
      documentNumber: number;
    }): Promise<Invoice | null> {
      const row = await db.findFirst({
        where: {
          document: {
            type: "INVOICE",
            organizationId,
            documentNumberPrefix: prefix,
            documentNumber,
          },
        },
      });
      return row ? invoiceRowToDomain(row) : null;
    },

    async list(args: ListInvoicesArgs): Promise<Page<InvoiceWithDocument>> {
      const page = args.page ?? 1;
      const perPage = args.perPage ?? 20;
      const documentWhere: any = { organizationId: args.organizationId };
      if (args.clientId) documentWhere.clientId = args.clientId;
      if (args.issueDateFrom || args.issueDateTo) {
        documentWhere.issueDate = {};
        if (args.issueDateFrom) documentWhere.issueDate.gte = args.issueDateFrom;
        if (args.issueDateTo) documentWhere.issueDate.lte = args.issueDateTo;
      }
      if (args.dueBefore) documentWhere.dueDate = { lt: args.dueBefore };
      const search = documentSearchWhere(args.query);
      if (search) Object.assign(documentWhere, search);
      const where: any = { document: documentWhere };
      if (args.status) {
        where.status = Array.isArray(args.status)
          ? { in: args.status }
          : args.status;
      }
      const [rows, totalCount] = await Promise.all([
        db.findMany({
          where,
          include: WITH_DOCUMENT_INCLUDE,
          skip: (page - 1) * perPage,
          take: perPage,
          orderBy: invoiceListOrderBy(args.sortBy, args.sortDir),
        }),
        db.count({ where }),
      ]);
      return {
        data: rows.map(invoiceWithDocumentRowToDomain),
        pageInfo: {
          page,
          perPage,
          totalCount,
          pageCount: Math.max(1, Math.ceil(totalCount / perPage)),
        },
      };
    },

    async update(id: string, organizationId: string, patch: InvoiceUpdate): Promise<Invoice> {
      const { count } = await db.updateMany({
        where: { id, document: { organizationId } },
        data: patch,
      });
      if (count === 0) throw new Error("invoice not found");
      const row = await db.findUnique({ where: { id } });
      return invoiceRowToDomain(row);
    },

    async delete(id: string, organizationId: string): Promise<void> {
      await db.deleteMany({
        where: { id, document: { organizationId } },
      });
    },
  };
}
