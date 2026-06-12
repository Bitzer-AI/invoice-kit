import type { QuoteWithDocument, DocumentWithRelations } from "../../adapters/types";
import type { QuoteResponse } from "./validation";

function lineItemToResponse(lineItem: DocumentWithRelations["lineItems"][number]) {
  return {
    id: lineItem.id,
    productId: lineItem.productId,
    quantity: lineItem.quantity,
    price: lineItem.price.toString(),
    currency: lineItem.currency,
    taxAmount: lineItem.taxAmount.toString(),
    total: lineItem.total.toString(),
    description: lineItem.description,
    metadata: lineItem.metadata ?? null,
    source:
      lineItem.product.sourceType !== null && lineItem.product.sourceId !== null
        ? { type: lineItem.product.sourceType, id: lineItem.product.sourceId, name: lineItem.product.name }
        : null,
    taxes: lineItem.taxes.map((tax) => ({
      id: tax.id,
      taxId: tax.taxId,
      taxAmount: tax.taxAmount.toString(),
    })),
  };
}

function documentToResponse(doc: DocumentWithRelations) {
  return {
    // invoices/quotes always have a client (party invariant); vendor bills use vendorId instead
    clientId: doc.clientId!,
    documentNumberPrefix: doc.documentNumberPrefix,
    documentNumber: doc.documentNumber,
    issueDate: doc.issueDate.toISOString().slice(0, 10),
    dueDate: doc.dueDate ? doc.dueDate.toISOString().slice(0, 10) : null,
    notes: doc.notes,
    currency: doc.currency,
    subtotal: doc.subtotal !== null ? doc.subtotal.toString() : null,
    tax: doc.tax !== null ? doc.tax.toString() : null,
    total: doc.total !== null ? doc.total.toString() : null,
    lineItems: doc.lineItems.map(lineItemToResponse),
  };
}

export function quoteToResponse(q: QuoteWithDocument): QuoteResponse {
  return {
    id: q.id,
    documentId: q.documentId,
    status: q.status,
    validUntil: q.validUntil ? q.validUntil.toISOString().slice(0, 10) : null,
    document: documentToResponse(q.document),
  };
}
