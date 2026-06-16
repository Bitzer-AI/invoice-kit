// Row → domain DTO mappers for the Prisma adapter.
// Each mapper converts Prisma's generated row shape into the package's plain TS types.
//
// Conventions:
// - Prisma `Decimal` → `string` (via `.toFixed(N)`).
// - Prisma `BigInt` → `bigint` (already correct, just narrow).
// - `Json` → `unknown`.

import type {
  Client,
  Document,
  DocumentLineItem,
  DocumentLineItemTax,
  DocumentNumberSequence,
  DocumentPaymentMethod,
  DocumentType,
  FiscalDocument,
  FiscalStatus,
  Invoice,
  InvoiceStatus,
  Note,
  NoteStatus,
  Payment,
  PaymentMethod,
  PaymentMethodType,
  PaymentStatus,
  Product,
  Quote,
  QuoteStatus,
  Tax,
  TaxType,
  Vendor,
  VendorBill,
  VendorBillStatus,
  VendorBillPayment,
  VendorBillPaymentStatus,
} from "../../types";
import type {
  DocumentWithRelations,
  InvoiceWithDocument,
  NoteWithDocument,
  QuoteWithDocument,
  VendorBillWithDocument,
} from "../types";

export function clientRowToDomain(row: any): Client {
  return {
    id: row.id,
    organizationId: row.organizationId,
    name: row.name,
    email: row.email ?? null,
    phone: row.phone ?? null,
    taxId: row.taxId ?? null,
    taxIdType: row.taxIdType ?? null,
    country: row.country ?? null,
    addressLine1: row.addressLine1 ?? null,
    city: row.city ?? null,
    state: row.state ?? null,
    postalCode: row.postalCode ?? null,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export function productRowToDomain(row: any): Product {
  return {
    id: row.id,
    organizationId: row.organizationId,
    name: row.name,
    description: row.description ?? null,
    price: row.price.toFixed(2), // Prisma Decimal -> string, preserve 2dp from Decimal(10,2) column
    currency: row.currency,
    sourceType: row.sourceType ?? null,
    sourceId: row.sourceId ?? null,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export function taxRowToDomain(row: any): Tax {
  return {
    id: row.id,
    organizationId: row.organizationId,
    name: row.name,
    description: row.description ?? null,
    type: row.type as TaxType,
    rate: row.rate.toFixed(4), // Decimal(10,4); preserve trailing zeros
    isActive: row.isActive,
    isDefault: row.isDefault,
    fiscalCategory: row.fiscalCategory ?? null,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export function paymentMethodRowToDomain(row: any): PaymentMethod {
  return {
    id: row.id,
    organizationId: row.organizationId,
    name: row.name,
    type: row.type as PaymentMethodType,
    instructions: row.instructions ?? null,
    metadata: row.metadata ?? null,
    isActive: row.isActive,
    isDefault: row.isDefault,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export function documentSequenceRowToDomain(row: any): DocumentNumberSequence {
  return {
    id: row.id,
    organizationId: row.organizationId,
    documentType: row.documentType as DocumentType,
    prefix: row.prefix ?? null,
    label: row.label ?? null,
    nextNumber: row.nextNumber,
    padWidth: row.padWidth ?? null,
    updatedAt: row.updatedAt,
  };
}

export function documentRowToDomain(row: any): Document {
  return {
    id: row.id,
    type: row.type as DocumentType,
    organizationId: row.organizationId,
    clientId: row.clientId ?? null,
    vendorId: row.vendorId ?? null,
    referencedDocumentId: row.referencedDocumentId ?? null,
    externalDocumentNumber: row.externalDocumentNumber ?? null,
    documentNumberPrefix: row.documentNumberPrefix ?? null,
    documentNumber: row.documentNumber,
    issueDate: row.issueDate,
    dueDate: row.dueDate ?? null,
    notes: row.notes ?? null,
    currency: row.currency,
    subtotal: row.subtotal ?? null,
    tax: row.tax ?? null,
    total: row.total ?? null,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export function documentLineItemRowToDomain(row: any): DocumentLineItem {
  return {
    id: row.id,
    documentId: row.documentId,
    productId: row.productId,
    // Prisma Decimal(10,4): use toString() so "2" round-trips as "2" (not "2.0000").
    // Callers that need "1.0000" form should store with trailing zeros.
    quantity: row.quantity.toString(),
    price: row.price,
    currency: row.currency,
    taxAmount: row.taxAmount ?? 0n,
    total: row.total,
    description: row.description ?? null,
    metadata: row.metadata ?? null,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export function documentLineItemTaxRowToDomain(row: any): DocumentLineItemTax {
  return {
    id: row.id,
    lineItemId: row.lineItemId,
    taxId: row.taxId,
    taxAmount: row.taxAmount,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export function documentPaymentMethodRowToDomain(row: any): DocumentPaymentMethod {
  return {
    id: row.id,
    documentId: row.documentId,
    paymentMethodId: row.paymentMethodId,
    createdAt: row.createdAt,
  };
}

export function documentWithRelationsRowToDomain(row: any): DocumentWithRelations {
  return {
    ...documentRowToDomain(row),
    client: row.client
      ? {
          id: row.client.id,
          name: row.client.name,
          email: row.client.email ?? null,
          phone: row.client.phone ?? null,
          taxId: row.client.taxId ?? null,
          taxIdType: row.client.taxIdType ?? null,
          country: row.client.country ?? null,
          addressLine1: row.client.addressLine1 ?? null,
          city: row.client.city ?? null,
          state: row.client.state ?? null,
          postalCode: row.client.postalCode ?? null,
        }
      : null,
    vendor: row.vendor
      ? {
          id: row.vendor.id,
          name: row.vendor.name,
          email: row.vendor.email ?? null,
          phone: row.vendor.phone ?? null,
          taxId: row.vendor.taxId ?? null,
          taxIdType: row.vendor.taxIdType ?? null,
        }
      : null,
    lineItems: (row.lineItems ?? []).map((lineItemRow: any) => ({
      ...documentLineItemRowToDomain(lineItemRow),
      taxes: (lineItemRow.taxes ?? []).map(documentLineItemTaxRowToDomain),
      product: {
        name: lineItemRow.product?.name ?? "",
        description: lineItemRow.product?.description ?? null,
        price: lineItemRow.product?.price?.toFixed(2) ?? "0.00",
        currency: lineItemRow.product?.currency ?? "usd",
        sourceType: lineItemRow.product?.sourceType ?? null,
        sourceId: lineItemRow.product?.sourceId ?? null,
      },
    })),
    paymentMethods: (row.paymentMethods ?? []).map(documentPaymentMethodRowToDomain),
  };
}

export function invoiceRowToDomain(row: any): Invoice {
  return {
    id: row.id,
    documentId: row.documentId,
    status: row.status as InvoiceStatus,
    paidDate: row.paidDate ?? null,
    convertedFromQuoteId: row.convertedFromQuoteId ?? null,
  };
}

export function invoiceWithDocumentRowToDomain(row: any): InvoiceWithDocument {
  return {
    ...invoiceRowToDomain(row),
    document: documentWithRelationsRowToDomain(row.document),
  };
}

export function quoteRowToDomain(row: any): Quote {
  return {
    id: row.id,
    documentId: row.documentId,
    status: row.status as QuoteStatus,
    validUntil: row.validUntil ?? null,
  };
}

export function quoteWithDocumentRowToDomain(row: any): QuoteWithDocument {
  return {
    ...quoteRowToDomain(row),
    document: documentWithRelationsRowToDomain(row.document),
  };
}

export function fiscalDocumentRowToDomain(row: any): FiscalDocument {
  return {
    id: row.id,
    invoiceId: row.invoiceId,
    provider: row.provider,
    status: row.status as FiscalStatus,
    documentType: row.documentType ?? null,
    fiscalId: row.fiscalId ?? null,
    trackId: row.trackId ?? null,
    securityCode: row.securityCode ?? null,
    qrUrl: row.qrUrl ?? null,
    message: row.message ?? null,
    payload: row.payload ?? null,
    issuedAt: row.issuedAt ?? null,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export function paymentRowToDomain(row: any): Payment {
  return {
    id: row.id,
    invoiceId: row.invoiceId,
    paymentMethodId: row.paymentMethodId ?? null,
    amount: row.amount,
    currency: row.currency,
    status: row.status as PaymentStatus,
    provider: row.provider,
    stripePaymentIntentId: row.stripePaymentIntentId ?? null,
    stripeCheckoutSessionId: row.stripeCheckoutSessionId ?? null,
    stripeChargeId: row.stripeChargeId ?? null,
    paidAt: row.paidAt ?? null,
    failedAt: row.failedAt ?? null,
    failureReason: row.failureReason ?? null,
    reference: row.reference ?? null,
    notes: row.notes ?? null,
    recordedBy: row.recordedBy ?? null,
    metadata: row.metadata ?? null,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export function vendorRowToDomain(row: any): Vendor {
  return {
    id: row.id,
    organizationId: row.organizationId,
    name: row.name,
    email: row.email ?? null,
    phone: row.phone ?? null,
    taxId: row.taxId ?? null,
    taxIdType: row.taxIdType ?? null,
    isActive: row.isActive,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export function vendorBillRowToDomain(row: any): VendorBill {
  return {
    id: row.id,
    documentId: row.documentId,
    status: row.status as VendorBillStatus,
  };
}

export function vendorBillWithDocumentRowToDomain(row: any): VendorBillWithDocument {
  return {
    ...vendorBillRowToDomain(row),
    document: documentWithRelationsRowToDomain(row.document),
  };
}

export function noteRowToDomain(row: any): Note {
  return {
    id: row.id,
    documentId: row.documentId,
    status: row.status as NoteStatus,
  };
}

export function noteWithDocumentRowToDomain(row: any): NoteWithDocument {
  const referenced = row.document?.referencedDocument ?? null;
  return {
    ...noteRowToDomain(row),
    document: documentWithRelationsRowToDomain(row.document),
    referencedDocument: referenced
      ? {
          id: referenced.id,
          entityId: referenced.invoice?.id ?? referenced.vendorBill?.id ?? null,
          type: referenced.type as DocumentType,
          documentNumber: referenced.documentNumber,
          documentNumberPrefix: referenced.documentNumberPrefix ?? null,
          externalDocumentNumber: referenced.externalDocumentNumber ?? null,
          total: referenced.total ?? null,
          currency: referenced.currency,
          issueDate: referenced.issueDate,
        }
      : null,
  };
}

export function vendorBillPaymentRowToDomain(row: any): VendorBillPayment {
  return {
    id: row.id,
    organizationId: row.organizationId,
    vendorBillId: row.vendorBillId,
    paymentMethodId: row.paymentMethodId ?? null,
    amount: row.amount,
    currency: row.currency,
    status: row.status as VendorBillPaymentStatus,
    provider: row.provider,
    paidAt: row.paidAt ?? null,
    reference: row.reference ?? null,
    notes: row.notes ?? null,
    recordedBy: row.recordedBy ?? null,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}
