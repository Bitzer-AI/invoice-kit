import type { VendorBillWithDocument, DocumentWithRelations } from "../../adapters/types";
import type { VendorBillResponse } from "./validation";

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
    vendorId: doc.vendorId,
    vendor: doc.vendor
      ? {
          id: doc.vendor.id,
          name: doc.vendor.name,
          email: doc.vendor.email,
          phone: doc.vendor.phone,
          taxId: doc.vendor.taxId,
          taxIdType: doc.vendor.taxIdType,
        }
      : null,
    clientId: doc.clientId,
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

export function vendorBillToResponse(vendorBill: VendorBillWithDocument): VendorBillResponse {
  return {
    id: vendorBill.id,
    documentId: vendorBill.documentId,
    status: vendorBill.status,
    document: documentToResponse(vendorBill.document),
  };
}
