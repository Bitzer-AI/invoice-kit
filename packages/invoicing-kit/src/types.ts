// Numeric primitives at the package boundary.
// Currency amounts: integer cents (or smallest unit), expressed as bigint to avoid float drift.
export type BigintMinor = bigint;
// Decimals (rates, quantities): string in canonical Prisma Decimal format.
export type DecimalString = string;

export type DocumentType =
  | "INVOICE"
  | "QUOTE"
  | "VENDOR_BILL"
  | "CREDIT_NOTE"
  | "DEBIT_NOTE";
export type InvoiceStatus = "draft" | "sent" | "paid" | "partially_paid";
export type QuoteStatus = "draft" | "sent" | "accepted" | "rejected" | "converted";
export type TaxType = "PERCENTAGE" | "FIXED";
// Known gateways are listed for autocomplete, but any provider string is allowed
// so integrators can support regional gateways (e.g. AZUL) without a library change.
export type PaymentMethodType = "STRIPE" | "MANUAL" | "AZUL" | (string & {});
export type PaymentStatus = "pending" | "processing" | "succeeded" | "failed" | "canceled";

export interface Client {
  id: string;
  organizationId: string;
  name: string;
  email: string | null;
  phone: string | null;
  taxId: string | null;
  taxIdType: string | null;
  country: string | null;
  addressLine1: string | null;
  city: string | null;
  state: string | null;
  postalCode: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface Vendor {
  id: string;
  organizationId: string;
  name: string;
  email: string | null;
  phone: string | null;
  taxId: string | null;
  taxIdType: string | null;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export type VendorBillStatus = "draft" | "received" | "partially_paid" | "paid";

/** Thin view over a Document of type VENDOR_BILL. The document carries the money + line items + currency; this carries the bill status. */
export interface VendorBill {
  id: string;
  documentId: string;
  status: VendorBillStatus;
}

export type NoteStatus = "draft" | "issued";

/** A credit or debit note. Direction is carried by Document.type
 * (CREDIT_NOTE reduces, DEBIT_NOTE increases the referenced document). */
export interface Note {
  id: string;
  documentId: string;
  status: NoteStatus;
}

export type VendorBillPaymentStatus = "succeeded" | "failed" | "canceled";

export interface VendorBillPayment {
  id: string;
  organizationId: string;
  vendorBillId: string;
  paymentMethodId: string | null;
  /** Net cash paid to the vendor, in minor units. */
  amount: BigintMinor;
  currency: string;
  status: VendorBillPaymentStatus;
  provider: string;
  paidAt: Date | null;
  reference: string | null;
  notes: string | null;
  recordedBy: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface Product {
  id: string;
  organizationId: string;
  name: string;
  description: string | null;
  price: DecimalString;
  /** Opaque app-defined link to a host-app domain object (e.g. "experience"). */
  sourceType: string | null;
  /** Id of the linked source object, as a string. */
  sourceId: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface Tax {
  id: string;
  organizationId: string;
  name: string;
  description: string | null;
  type: TaxType;
  rate: DecimalString;
  isActive: boolean;
  isDefault: boolean;
  fiscalCategory: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface DocumentNumberSequence {
  id: string;
  organizationId: string;
  documentType: DocumentType;
  prefix: string | null;
  label: string | null;
  nextNumber: number;
  padWidth: number | null;
  updatedAt: Date;
}

export interface Document {
  id: string;
  type: DocumentType;
  organizationId: string;
  clientId: string | null;
  vendorId: string | null;
  /** Received supplier NCF / e-CF number (vendor bills). Null for invoices/quotes. */
  externalDocumentNumber: string | null;
  /** For notes: the Document this note modifies (an INVOICE or VENDOR_BILL). Null otherwise. */
  referencedDocumentId: string | null;
  documentNumberPrefix: string | null;
  documentNumber: number;
  issueDate: Date;
  dueDate: Date | null;
  notes: string | null;
  currency: string;
  subtotal: BigintMinor | null;
  tax: BigintMinor | null;
  total: BigintMinor | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface DocumentLineItem {
  id: string;
  documentId: string;
  productId: string;
  quantity: DecimalString;
  price: BigintMinor;
  taxAmount: BigintMinor;
  total: BigintMinor;
  description: string | null;
  metadata: Record<string, unknown> | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface DocumentLineItemTax {
  id: string;
  lineItemId: string;
  taxId: string;
  taxAmount: BigintMinor;
  createdAt: Date;
  updatedAt: Date;
}

export interface Invoice {
  id: string;
  documentId: string;
  status: InvoiceStatus;
  paidDate: Date | null;
  convertedFromQuoteId: string | null;
}

export interface Quote {
  id: string;
  documentId: string;
  status: QuoteStatus;
  validUntil: Date | null;
}

export interface PaymentMethod {
  id: string;
  organizationId: string;
  name: string;
  type: PaymentMethodType;
  instructions: string | null;
  metadata: unknown | null;
  isActive: boolean;
  isDefault: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface DocumentPaymentMethod {
  id: string;
  documentId: string;
  paymentMethodId: string;
  createdAt: Date;
}

export type FiscalStatus =
  | "pending" | "accepted" | "rejected" | "conditional" | "contingency";

export interface FiscalDocument {
  id: string;
  invoiceId: string;
  provider: string;
  status: FiscalStatus;
  documentType: string | null;
  fiscalId: string | null;
  trackId: string | null;
  securityCode: string | null;
  qrUrl: string | null;
  message: string | null;
  payload: unknown | null;
  issuedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface Payment {
  id: string;
  invoiceId: string;
  paymentMethodId: string | null;
  amount: BigintMinor;
  currency: string;
  status: PaymentStatus;
  provider: string;
  stripePaymentIntentId: string | null;
  stripeCheckoutSessionId: string | null;
  stripeChargeId: string | null;
  paidAt: Date | null;
  failedAt: Date | null;
  failureReason: string | null;
  reference: string | null;
  notes: string | null;
  recordedBy: string | null;
  metadata: unknown | null;
  createdAt: Date;
  updatedAt: Date;
}
