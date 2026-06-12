import type { NoteWithDocument, DocumentWithRelations } from "../../adapters/types";
import type { NoteResponse } from "./validation";

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
    type: doc.type,
    clientId: doc.clientId,
    vendorId: doc.vendorId,
    referencedDocumentId: doc.referencedDocumentId,
    externalDocumentNumber: doc.externalDocumentNumber,
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

export function noteToResponse(note: NoteWithDocument): NoteResponse {
  return {
    id: note.id,
    documentId: note.documentId,
    status: note.status,
    document: documentToResponse(note.document),
  };
}
