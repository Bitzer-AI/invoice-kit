import type { NoteWithDocument, DocumentWithRelations } from "../../adapters/types";
import type { NoteResponse } from "./validation";

function lineItemToResponse(li: DocumentWithRelations["lineItems"][number]) {
  return {
    id: li.id,
    productId: li.productId,
    quantity: li.quantity,
    price: li.price.toString(),
    taxAmount: li.taxAmount.toString(),
    total: li.total.toString(),
    description: li.description,
    source:
      li.product.sourceType !== null && li.product.sourceId !== null
        ? { type: li.product.sourceType, id: li.product.sourceId, name: li.product.name }
        : null,
    taxes: li.taxes.map((t) => ({ id: t.id, taxId: t.taxId, taxAmount: t.taxAmount.toString() })),
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

export function noteToResponse(n: NoteWithDocument): NoteResponse {
  return {
    id: n.id,
    documentId: n.documentId,
    status: n.status,
    document: documentToResponse(n.document),
  };
}
