import type {
  DocumentRepository,
  DocumentUpdate,
  DocumentWithRelations,
  NewDocument,
  NewDocumentLineItem,
} from "../types";
import type { Document } from "../../types";
import type { AnyPrismaClient, PrismaModelNames } from "./client-type";
import {
  documentRowToDomain,
  documentWithRelationsRowToDomain,
} from "./mappers";

const FULL_INCLUDE = {
  lineItems: {
    include: {
      taxes: true,
      product: { select: { name: true, sourceType: true, sourceId: true } },
    },
  },
  paymentMethods: true,
};

export function createPrismaDocumentRepository(
  prisma: AnyPrismaClient,
  modelNames: PrismaModelNames,
): DocumentRepository {
  const documentDb = (prisma as any)[modelNames.document];
  const lineItemDb = (prisma as any)[modelNames.documentLineItem];
  const documentPaymentMethodDb = (prisma as any)[modelNames.documentPaymentMethod];
  return {
    async create(data: NewDocument): Promise<DocumentWithRelations> {
      const row = await documentDb.create({
        data: {
          type: data.type,
          organizationId: data.organizationId,
          clientId: data.clientId ?? null,
          vendorId: data.vendorId ?? null,
          referencedDocumentId: data.referencedDocumentId ?? null,
          externalDocumentNumber: data.externalDocumentNumber ?? null,
          documentNumberPrefix: data.documentNumberPrefix ?? null,
          documentNumber: data.documentNumber,
          issueDate: data.issueDate,
          dueDate: data.dueDate ?? null,
          notes: data.notes ?? null,
          currency: data.currency ?? "usd",
          subtotal: data.subtotal,
          tax: data.tax,
          total: data.total,
          lineItems: {
            create: data.lineItems.map((lineItem: NewDocumentLineItem) => ({
              productId: lineItem.productId,
              quantity: lineItem.quantity,
              price: lineItem.price,
              currency: lineItem.currency,
              taxAmount: lineItem.taxAmount,
              total: lineItem.total,
              description: lineItem.description ?? null,
              metadata: lineItem.metadata ?? null,
              taxes: {
                create: lineItem.taxes.map((tax) => ({
                  taxId: tax.taxId,
                  taxAmount: tax.taxAmount,
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
      const row = await documentDb.findFirst({
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
      const { count } = await documentDb.updateMany({
        where: { id, organizationId },
        data: patch,
      });
      if (count === 0) throw new Error("document not found");
      const row = await documentDb.findUnique({ where: { id } });
      return documentRowToDomain(row);
    },

    async replaceLineItems(
      documentId: string,
      organizationId: string,
      lineItems: NewDocumentLineItem[],
    ): Promise<void> {
      const owns = await documentDb.findFirst({
        where: { id: documentId, organizationId },
        select: { id: true },
      });
      if (!owns) throw new Error("document not found");
      await lineItemDb.deleteMany({ where: { documentId } });
      for (const lineItem of lineItems) {
        await lineItemDb.create({
          data: {
            documentId,
            productId: lineItem.productId,
            quantity: lineItem.quantity,
            price: lineItem.price,
            currency: lineItem.currency,
            taxAmount: lineItem.taxAmount,
            total: lineItem.total,
            description: lineItem.description ?? null,
            metadata: lineItem.metadata ?? null,
            taxes: {
              create: lineItem.taxes.map((tax) => ({
                taxId: tax.taxId,
                taxAmount: tax.taxAmount,
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
      const owns = await documentDb.findFirst({
        where: { id: documentId, organizationId },
        select: { id: true },
      });
      if (!owns) throw new Error("document not found");
      await documentPaymentMethodDb.deleteMany({ where: { documentId } });
      if (paymentMethodIds.length === 0) return;
      await documentPaymentMethodDb.createMany({
        data: paymentMethodIds.map((paymentMethodId) => ({
          documentId,
          paymentMethodId,
        })),
        skipDuplicates: true,
      });
    },

    async delete(id: string, organizationId: string): Promise<void> {
      await documentDb.deleteMany({ where: { id, organizationId } });
    },
  };
}
