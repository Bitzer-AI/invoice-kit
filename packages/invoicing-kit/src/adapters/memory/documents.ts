import { randomUUID } from "node:crypto";
import type {
  Document,
  DocumentLineItem,
  DocumentLineItemTax,
  DocumentPaymentMethod,
} from "../../types";
import type {
  DocumentRepository,
  DocumentUpdate,
  DocumentWithRelations,
  NewDocument,
  NewDocumentLineItem,
} from "../types";
import type { MemoryStore } from "./store";

export function createInMemoryDocumentRepository(store: MemoryStore): DocumentRepository {
  const docs = store.documents;
  const lineItems = store.documentLineItems;
  const lineItemTaxes = store.documentLineItemTaxes;
  const paymentMethodLinks = store.documentPaymentMethods;

  function composeWithRelations(doc: Document): DocumentWithRelations {
    const docLineItems = Array.from(lineItems.values()).filter(
      (li) => li.documentId === doc.id,
    );
    const enrichedLineItems = docLineItems.map((li) => {
      const taxes = Array.from(lineItemTaxes.values()).filter(
        (t) => t.lineItemId === li.id,
      );
      const product = store.products.get(li.productId);
      return {
        ...li,
        taxes,
        product: {
          name: product?.name ?? "",
          sourceType: product?.sourceType ?? null,
          sourceId: product?.sourceId ?? null,
        },
      };
    });
    const paymentMethods = Array.from(paymentMethodLinks.values()).filter(
      (pm) => pm.documentId === doc.id,
    );
    return { ...doc, lineItems: enrichedLineItems, paymentMethods };
  }

  function insertLineItems(
    documentId: string,
    items: NewDocumentLineItem[],
  ): void {
    const now = new Date();
    for (const item of items) {
      const lineItemId = randomUUID();
      const lineItem: DocumentLineItem = {
        id: lineItemId,
        documentId,
        productId: item.productId,
        quantity: item.quantity,
        price: item.price,
        currency: item.currency,
        taxAmount: item.taxAmount,
        total: item.total,
        description: item.description ?? null,
        metadata: item.metadata ?? null,
        createdAt: now,
        updatedAt: now,
      };
      lineItems.set(lineItemId, lineItem);

      for (const tax of item.taxes) {
        const taxRowId = randomUUID();
        const taxRow: DocumentLineItemTax = {
          id: taxRowId,
          lineItemId,
          taxId: tax.taxId,
          taxAmount: tax.taxAmount,
          createdAt: now,
          updatedAt: now,
        };
        lineItemTaxes.set(taxRowId, taxRow);
      }
    }
  }

  function deleteLineItemsForDoc(documentId: string): void {
    const docLineItemIds: string[] = [];
    for (const [id, li] of lineItems) {
      if (li.documentId === documentId) {
        docLineItemIds.push(id);
      }
    }
    for (const id of docLineItemIds) {
      lineItems.delete(id);
      // Cascade: delete all taxes for this line item
      for (const [taxRowId, taxRow] of lineItemTaxes) {
        if (taxRow.lineItemId === id) {
          lineItemTaxes.delete(taxRowId);
        }
      }
    }
  }

  const repo: DocumentRepository = {
    async create(data: NewDocument): Promise<DocumentWithRelations> {
      const now = new Date();
      const id = randomUUID();
      const doc: Document = {
        id,
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
        createdAt: now,
        updatedAt: now,
      };
      docs.set(id, doc);

      insertLineItems(id, data.lineItems);

      if (data.paymentMethodIds) {
        for (const paymentMethodId of data.paymentMethodIds) {
          const pmId = randomUUID();
          const pmLink: DocumentPaymentMethod = {
            id: pmId,
            documentId: id,
            paymentMethodId,
            createdAt: now,
          };
          paymentMethodLinks.set(pmId, pmLink);
        }
      }

      return composeWithRelations(doc);
    },

    async findById(
      id: string,
      organizationId: string,
    ): Promise<DocumentWithRelations | null> {
      const doc = docs.get(id);
      if (!doc || doc.organizationId !== organizationId) return null;
      return composeWithRelations(doc);
    },

    async update(
      id: string,
      organizationId: string,
      patch: DocumentUpdate,
    ): Promise<Document> {
      const existing = docs.get(id);
      if (!existing || existing.organizationId !== organizationId) {
        throw new Error("document not found");
      }
      const updated: Document = {
        ...existing,
        ...patch,
        updatedAt: new Date(),
      };
      docs.set(id, updated);
      return updated;
    },

    async replaceLineItems(
      documentId: string,
      organizationId: string,
      items: NewDocumentLineItem[],
    ): Promise<void> {
      const doc = docs.get(documentId);
      if (!doc || doc.organizationId !== organizationId) {
        throw new Error("document not found");
      }
      deleteLineItemsForDoc(documentId);
      insertLineItems(documentId, items);
    },

    async setPaymentMethods(
      documentId: string,
      organizationId: string,
      paymentMethodIds: string[],
    ): Promise<void> {
      const doc = docs.get(documentId);
      if (!doc || doc.organizationId !== organizationId) {
        throw new Error("document not found");
      }
      // Delete existing payment method links for this doc
      for (const [pmId, pm] of paymentMethodLinks) {
        if (pm.documentId === documentId) {
          paymentMethodLinks.delete(pmId);
        }
      }
      // Insert new ones (skip duplicates by tracking seen paymentMethodIds)
      const seen = new Set<string>();
      const now = new Date();
      for (const paymentMethodId of paymentMethodIds) {
        if (seen.has(paymentMethodId)) continue;
        seen.add(paymentMethodId);
        const pmId = randomUUID();
        paymentMethodLinks.set(pmId, {
          id: pmId,
          documentId,
          paymentMethodId,
          createdAt: now,
        });
      }
    },

    async delete(id: string, organizationId: string): Promise<void> {
      const doc = docs.get(id);
      if (!doc || doc.organizationId !== organizationId) return;
      deleteLineItemsForDoc(id);
      // Delete payment method links
      for (const [pmId, pm] of paymentMethodLinks) {
        if (pm.documentId === id) {
          paymentMethodLinks.delete(pmId);
        }
      }
      docs.delete(id);
    },
  };

  return repo;
}
