import type {
  InvoiceRepository,
  InvoiceUpdate,
  InvoiceWithDocument,
  ListInvoicesArgs,
  NewInvoice,
  Page,
} from "../types";
import type { Invoice } from "../../types";
import type { AnyPrismaClient } from "./client-type";
import {
  invoiceRowToDomain,
  invoiceWithDocumentRowToDomain,
} from "./mappers";

const FULL_INCLUDE = {
  document: {
    include: {
      lineItems: { include: { taxes: true } },
      paymentMethods: true,
    },
  },
};

export function createPrismaInvoiceRepository(
  prisma: AnyPrismaClient,
): InvoiceRepository {
  const db = prisma as any;
  return {
    async create(data: NewInvoice): Promise<Invoice> {
      const row = await db.invoice.create({
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
      const row = await db.invoice.findFirst({
        where: { id, document: { organizationId } },
        include: FULL_INCLUDE,
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
      const row = await db.invoice.findFirst({
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
      const where: any = { document: documentWhere };
      if (args.status) {
        where.status = Array.isArray(args.status)
          ? { in: args.status }
          : args.status;
      }
      const [rows, totalCount] = await Promise.all([
        db.invoice.findMany({
          where,
          include: FULL_INCLUDE,
          skip: (page - 1) * perPage,
          take: perPage,
          orderBy: { document: { createdAt: "desc" } },
        }),
        db.invoice.count({ where }),
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
      const { count } = await db.invoice.updateMany({
        where: { id, document: { organizationId } },
        data: patch,
      });
      if (count === 0) throw new Error("invoice not found");
      const row = await db.invoice.findUnique({ where: { id } });
      return invoiceRowToDomain(row);
    },

    async delete(id: string, organizationId: string): Promise<void> {
      await db.invoice.deleteMany({
        where: { id, document: { organizationId } },
      });
    },
  };
}
