import type { InvoiceWithDocument, DocumentWithRelations } from "../../adapters/types";
import type { InvoiceResponse } from "./validation";

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
    product: {
      id: lineItem.productId,
      name: lineItem.product.name,
      description: lineItem.product.description,
      price: lineItem.product.price,
      currency: lineItem.product.currency,
    },
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

export function invoiceToResponse(i: InvoiceWithDocument): InvoiceResponse {
  return {
    id: i.id,
    documentId: i.documentId,
    status: i.status,
    paidDate: i.paidDate ? i.paidDate.toISOString().slice(0, 10) : null,
    convertedFromQuoteId: i.convertedFromQuoteId,
    document: documentToResponse(i.document),
  };
}
