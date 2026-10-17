import { randomUUID } from "node:crypto";
import { DEFAULT_CURRENCY } from "../../lib/currency";
import { canonicalDecimal } from "../../lib/money";
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
  ReplacementLineItem,
} from "../types";
import type { MemoryStore } from "./store";

export function createInMemoryDocumentRepository(store: MemoryStore): DocumentRepository {
  const docs = store.documents;
  const lineItems = store.documentLineItems;
  const lineItemTaxes = store.documentLineItemTaxes;
  const paymentMethodLinks = store.documentPaymentMethods;

  function composeWithRelations(doc: Document): DocumentWithRelations {
    const docLineItems = Array.from(lineItems.values()).filter(
      (lineItem) => lineItem.documentId === doc.id,
    );
    const enrichedLineItems = docLineItems.map((lineItem) => {
      const taxes = Array.from(lineItemTaxes.values()).filter(
        (tax) => tax.lineItemId === lineItem.id,
      );
      const product = lineItem.productId
        ? store.products.get(lineItem.productId)
        : null;
      if (lineItem.productId && !product) {
        throw new Error("A catalog-linked line item references a missing product");
      }
      return {
        ...lineItem,
        taxes,
        product: product
          ? {
              name: product.name,
              description: product.description,
              price: product.price,
              currency: product.currency,
              sourceType: product.sourceType,
              sourceId: product.sourceId,
            }
          : null,
      };
    });
    const paymentMethods = Array.from(paymentMethodLinks.values()).filter(
      (pm) => pm.documentId === doc.id,
    );
    const client = doc.clientId ? store.clients.get(doc.clientId) : undefined;
    const vendor = doc.vendorId ? store.vendors.get(doc.vendorId) : undefined;
    return {
      ...doc,
      client: client
        ? {
            id: client.id,
            name: client.name,
            email: client.email,
            phone: client.phone,
            taxId: client.taxId,
            taxIdType: client.taxIdType,
            country: client.country,
            addressLine1: client.addressLine1,
            city: client.city,
            state: client.state,
            postalCode: client.postalCode,
          }
        : null,
      vendor: vendor
        ? {
            id: vendor.id,
            name: vendor.name,
            email: vendor.email,
            phone: vendor.phone,
            taxId: vendor.taxId,
            taxIdType: vendor.taxIdType,
          }
        : null,
      lineItems: enrichedLineItems,
      paymentMethods,
    };
  }

  function lineItemFields(item: NewDocumentLineItem) {
    return {
      productId: item.productId,
      quantity: item.quantity,
      price: item.price,
      currency: item.currency,
      taxAmount: item.taxAmount,
      total: item.total,
      baseSubtotal: item.baseSubtotal ?? null,
      description: item.description ?? null,
      metadata: item.metadata ?? null,
    };
  }

  function insertLineItemTaxes(lineItemId: string, item: NewDocumentLineItem, now: Date): void {
    for (const tax of item.taxes) {
      const taxRowId = randomUUID();
      const taxRow: DocumentLineItemTax = {
        id: taxRowId,
        lineItemId,
        taxId: tax.taxId,
        taxAmount: tax.taxAmount,
        baseTaxAmount: tax.baseTaxAmount ?? null,
        createdAt: now,
        updatedAt: now,
      };
      lineItemTaxes.set(taxRowId, taxRow);
    }
  }

  function deleteLineItemTaxes(lineItemId: string): void {
    for (const [taxRowId, taxRow] of lineItemTaxes) {
      if (taxRow.lineItemId === lineItemId) {
        lineItemTaxes.delete(taxRowId);
      }
    }
  }

  function insertLineItem(documentId: string, item: NewDocumentLineItem, now: Date): void {
    const lineItemId = randomUUID();
    const lineItem: DocumentLineItem = {
      id: lineItemId,
      documentId,
      ...lineItemFields(item),
      createdAt: now,
      updatedAt: now,
    };
    lineItems.set(lineItemId, lineItem);
    insertLineItemTaxes(lineItemId, item, now);
  }

  function insertLineItems(
    documentId: string,
    items: NewDocumentLineItem[],
  ): void {
    const now = new Date();
    for (const item of items) insertLineItem(documentId, item, now);
  }

  function rewriteLineItem(stored: DocumentLineItem, item: NewDocumentLineItem, now: Date): void {
    lineItems.set(stored.id, { ...stored, ...lineItemFields(item), updatedAt: now });
    deleteLineItemTaxes(stored.id);
    insertLineItemTaxes(stored.id, item, now);
  }

  function lineItemsOfDoc(documentId: string): DocumentLineItem[] {
    return [...lineItems.values()].filter((lineItem) => lineItem.documentId === documentId);
  }

  function deleteLineItemsForDoc(documentId: string): void {
    for (const lineItem of lineItemsOfDoc(documentId)) {
      lineItems.delete(lineItem.id);
      deleteLineItemTaxes(lineItem.id);
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
        documentNumberPadWidth: data.documentNumberPadWidth,
        issueDate: data.issueDate,
        dueDate: data.dueDate ?? null,
        notes: data.notes ?? null,
        currency: data.currency ?? DEFAULT_CURRENCY,
        subtotal: data.subtotal,
        tax: data.tax,
        total: data.total,
        moneyPolicy: data.moneyPolicy ?? null,
        baseCurrency: data.baseCurrency ?? null,
        exchangeRate: data.exchangeRate != null ? canonicalDecimal(data.exchangeRate) : null,
        exchangeRateDate: data.exchangeRateDate ?? null,
        exchangeRateSource: data.exchangeRateSource ?? null,
        baseSubtotal: data.baseSubtotal ?? null,
        baseTax: data.baseTax ?? null,
        baseTotal: data.baseTotal ?? null,
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
      const normalizedPatch =
        patch.exchangeRate != null
          ? { ...patch, exchangeRate: canonicalDecimal(patch.exchangeRate) }
          : patch;
      const updated: Document = {
        ...existing,
        ...normalizedPatch,
        updatedAt: new Date(),
      };
      docs.set(id, updated);
      return updated;
    },

    async replaceLineItems(
      documentId: string,
      organizationId: string,
      items: ReplacementLineItem[],
    ): Promise<void> {
      const doc = docs.get(documentId);
      if (!doc || doc.organizationId !== organizationId) {
        throw new Error("document not found");
      }
      const storedById = new Map(lineItemsOfDoc(documentId).map((lineItem) => [lineItem.id, lineItem]));
      const keptIds = new Set(items.flatMap((item) => (item.id === null ? [] : [item.id])));
      if ([...keptIds].some((id) => !storedById.has(id))) throw new Error("line item not found");
      for (const stored of storedById.values()) {
        if (keptIds.has(stored.id)) continue;
        lineItems.delete(stored.id);
        deleteLineItemTaxes(stored.id);
      }
      const now = new Date();
      for (const item of items) {
        const stored = item.id === null ? undefined : storedById.get(item.id);
        if (stored === undefined) insertLineItem(documentId, item, now);
        else rewriteLineItem(stored, item, now);
      }
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
