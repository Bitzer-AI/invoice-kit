import type { QuoteWithDocument, DocumentWithRelations } from "../../adapters/types";
import type { QuoteResponse } from "./validation";
import {
  documentMoneyToResponse,
  lineItemBaseToResponse,
  lineItemTaxBaseToResponse,
} from "../../lib/document-response";
import { requireDocumentNumber, requireDocumentNumberPadWidth } from "../../lib/numbering";
import { BillingDocumentInvariantError } from "../../lib/errors";

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
      lineItem.product?.sourceType && lineItem.product.sourceId
        ? { type: lineItem.product.sourceType, id: lineItem.product.sourceId, name: lineItem.product.name }
        : null,
    product: lineItem.product && lineItem.productId
      ? {
          id: lineItem.productId,
          name: lineItem.product.name,
          description: lineItem.product.description,
          price: lineItem.product.price,
          currency: lineItem.product.currency,
        }
      : null,
    taxes: lineItem.taxes.map((tax) => ({
      id: tax.id,
      taxId: tax.taxId,
      taxAmount: tax.taxAmount.toString(),
      ...lineItemTaxBaseToResponse(tax),
    })),
    ...lineItemBaseToResponse(lineItem),
  };
}

function documentToResponse(doc: DocumentWithRelations) {
  if (doc.clientId === null) {
    throw new BillingDocumentInvariantError("A quote has no client");
  }
  return {
    // invoices/quotes always have a client (party invariant); vendor bills use vendorId instead
    clientId: doc.clientId,
    client: doc.client
      ? {
          id: doc.client.id,
          name: doc.client.name,
          email: doc.client.email,
          phone: doc.client.phone,
          taxId: doc.client.taxId,
          taxIdType: doc.client.taxIdType,
          country: doc.client.country,
          addressLine1: doc.client.addressLine1,
          city: doc.client.city,
          state: doc.client.state,
          postalCode: doc.client.postalCode,
        }
      : null,
    documentNumberPrefix: doc.documentNumberPrefix,
    documentNumber: requireDocumentNumber(doc.documentNumber),
    documentNumberPadWidth: requireDocumentNumberPadWidth(doc.documentNumberPadWidth),
    issueDate: doc.issueDate.toISOString().slice(0, 10),
    dueDate: doc.dueDate ? doc.dueDate.toISOString().slice(0, 10) : null,
    notes: doc.notes,
    currency: doc.currency,
    subtotal: doc.subtotal !== null ? doc.subtotal.toString() : null,
    tax: doc.tax !== null ? doc.tax.toString() : null,
    total: doc.total !== null ? doc.total.toString() : null,
    paymentMethodIds: doc.paymentMethods.map((method) => method.paymentMethodId),
    lineItems: doc.lineItems.map(lineItemToResponse),
    ...documentMoneyToResponse(doc),
  };
}

export function quoteToResponse(q: QuoteWithDocument): QuoteResponse {
  return {
    id: q.id,
    documentId: q.documentId,
    status: q.status,
    subject: q.subject,
    validUntil: q.validUntil ? q.validUntil.toISOString().slice(0, 10) : null,
    convertedInvoice: q.convertedInvoice,
    document: documentToResponse(q.document),
  };
}
