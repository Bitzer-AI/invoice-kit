import type {
  DocumentRepository,
  DocumentUpdate,
  DocumentWithRelations,
  NewDocument,
  NewDocumentLineItem,
} from "../types";
import type { Document } from "../../types";
import type { AnyPrismaClient } from "./client-type";
import {
  documentRowToDomain,
  documentWithRelationsRowToDomain,
} from "./mappers";

const FULL_INCLUDE = {
  lineItems: { include: { taxes: true } },
  paymentMethods: true,
};

export function createPrismaDocumentRepository(
  prisma: AnyPrismaClient,
): DocumentRepository {
  const db = prisma as any;
  return {
    async create(data: NewDocument): Promise<DocumentWithRelations> {
      const row = await db.document.create({
        data: {
          type: data.type,
          organizationId: data.organizationId,
          clientId: data.clientId,
          documentNumberPrefix: data.documentNumberPrefix ?? null,
          documentNumber: data.documentNumber,
          issueDate: data.issueDate,
          dueDate: data.dueDate ?? null,
          notes: data.notes ?? null,
          subtotal: data.subtotal,
          tax: data.tax,
          total: data.total,
          lineItems: {
            create: data.lineItems.map((li: NewDocumentLineItem) => ({
              productId: li.productId,
              quantity: li.quantity,
              price: li.price,
              taxAmount: li.taxAmount,
              total: li.total,
              description: li.description ?? null,
              taxes: {
                create: li.taxes.map((t) => ({
                  taxId: t.taxId,
                  taxAmount: t.taxAmount,
                })),
              },
            })),
          },
          paymentMethods:
            data.paymentMethodIds && data.paymentMethodIds.length > 0
              ? {
                  create: data.paymentMethodIds.map((paymentMethodId) => ({
                    paymentMethodId,
                  })),
                }
              : undefined,
        },
        include: FULL_INCLUDE,
      });
      return documentWithRelationsRowToDomain(row);
    },

    async findById(
      id: string,
      organizationId: string,
    ): Promise<DocumentWithRelations | null> {
      const row = await db.document.findFirst({
        where: { id, organizationId },
        include: FULL_INCLUDE,
      });
      return row ? documentWithRelationsRowToDomain(row) : null;
    },

    async update(
      id: string,
      organizationId: string,
      patch: DocumentUpdate,
    ): Promise<Document> {
      const { count } = await db.document.updateMany({
        where: { id, organizationId },
        data: patch,
      });
      if (count === 0) throw new Error("document not found");
      const row = await db.document.findUnique({ where: { id } });
      return documentRowToDomain(row);
    },

    async replaceLineItems(
      documentId: string,
      organizationId: string,
      lineItems: NewDocumentLineItem[],
    ): Promise<void> {
      const owns = await db.document.findFirst({
        where: { id: documentId, organizationId },
        select: { id: true },
      });
      if (!owns) throw new Error("document not found");
      await db.documentLineItem.deleteMany({ where: { documentId } });
      for (const li of lineItems) {
        await db.documentLineItem.create({
          data: {
            documentId,
            productId: li.productId,
            quantity: li.quantity,
            price: li.price,
            taxAmount: li.taxAmount,
            total: li.total,
            description: li.description ?? null,
            taxes: {
              create: li.taxes.map((t) => ({
                taxId: t.taxId,
                taxAmount: t.taxAmount,
              })),
            },
          },
        });
      }
    },

    async setPaymentMethods(
      documentId: string,
      organizationId: string,
      paymentMethodIds: string[],
    ): Promise<void> {
      const owns = await db.document.findFirst({
        where: { id: documentId, organizationId },
        select: { id: true },
      });
      if (!owns) throw new Error("document not found");
      await db.documentPaymentMethod.deleteMany({ where: { documentId } });
      if (paymentMethodIds.length === 0) return;
      await db.documentPaymentMethod.createMany({
        data: paymentMethodIds.map((paymentMethodId) => ({
          documentId,
          paymentMethodId,
        })),
        skipDuplicates: true,
      });
    },

    async delete(id: string, organizationId: string): Promise<void> {
      await db.document.deleteMany({ where: { id, organizationId } });
    },
  };
}
