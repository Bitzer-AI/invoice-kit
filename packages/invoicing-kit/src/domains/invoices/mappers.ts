import type { DocumentLineItem, DocumentLineItemTax } from "../../types";
import type { InvoiceWithDocument, DocumentWithRelations } from "../../adapters/types";
import type { InvoiceResponse } from "./validation";

function lineItemToResponse(li: DocumentLineItem & { taxes: DocumentLineItemTax[] }) {
  return {
    id: li.id,
    productId: li.productId,
    quantity: li.quantity,
    price: li.price.toString(),
    taxAmount: li.taxAmount.toString(),
    total: li.total.toString(),
    description: li.description,
    taxes: li.taxes.map((t) => ({
      id: t.id,
      taxId: t.taxId,
      taxAmount: t.taxAmount.toString(),
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
