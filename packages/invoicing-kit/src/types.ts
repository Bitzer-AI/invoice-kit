// Numeric primitives at the package boundary.
// Currency amounts: integer cents (or smallest unit), expressed as bigint to avoid float drift.
export type BigintMinor = bigint;
// Decimals (rates, quantities): string in canonical Prisma Decimal format.
export type DecimalString = string;

export const DocumentType = {
  Invoice: "INVOICE",
  Quote: "QUOTE",
  VendorBill: "VENDOR_BILL",
  CreditNote: "CREDIT_NOTE",
  DebitNote: "DEBIT_NOTE",
} as const;
export type DocumentType = (typeof DocumentType)[keyof typeof DocumentType];

export const InvoiceStatus = {
  Draft: "draft",
  Sent: "sent",
  Paid: "paid",
  PartiallyPaid: "partially_paid",
} as const;
export type InvoiceStatus = (typeof InvoiceStatus)[keyof typeof InvoiceStatus];

export const QuoteStatus = {
  Draft: "draft",
  Sent: "sent",
  Accepted: "accepted",
  Rejected: "rejected",
  Converted: "converted",
} as const;
export type QuoteStatus = (typeof QuoteStatus)[keyof typeof QuoteStatus];

export const TaxType = {
  Percentage: "PERCENTAGE",
  Fixed: "FIXED",
} as const;
export type TaxType = (typeof TaxType)[keyof typeof TaxType];

/** Which document side a product may appear on. SALE = invoices/quotes/credit notes; PURCHASE = vendor bills/debit notes; BOTH = either. */
export const ProductUsage = {
  Sale: "SALE",
  Purchase: "PURCHASE",
  Both: "BOTH",
} as const;
export type ProductUsage = (typeof ProductUsage)[keyof typeof ProductUsage];

/** Which side of the ledger a document sits on. */
export const DocumentSide = {
  Sale: "SALE",
  Purchase: "PURCHASE",
} as const;
export type DocumentSide = (typeof DocumentSide)[keyof typeof DocumentSide];

export const NoteType = {
  Credit: "CREDIT",
  Debit: "DEBIT",
} as const;
export type NoteType = (typeof NoteType)[keyof typeof NoteType];

// Known gateways are listed for autocomplete, but any provider string is allowed
// so integrators can support regional gateways (e.g. AZUL) without a library change.
export const PaymentMethodType = {
  Stripe: "STRIPE",
  Manual: "MANUAL",
  Azul: "AZUL",
} as const;
export type PaymentMethodType =
  | (typeof PaymentMethodType)[keyof typeof PaymentMethodType]
  | (string & {});

export const PaymentStatus = {
  Pending: "pending",
  Processing: "processing",
  Succeeded: "succeeded",
  Failed: "failed",
  Canceled: "canceled",
} as const;
export type PaymentStatus = (typeof PaymentStatus)[keyof typeof PaymentStatus];

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

export const VendorBillStatus = {
  Draft: "draft",
  Received: "received",
  PartiallyPaid: "partially_paid",
  Paid: "paid",
} as const;
export type VendorBillStatus = (typeof VendorBillStatus)[keyof typeof VendorBillStatus];

/** Thin view over a Document of type VENDOR_BILL. The document carries the money + line items + currency; this carries the bill status. */
export interface VendorBill {
  id: string;
  documentId: string;
  status: VendorBillStatus;
}

export const NoteStatus = {
  Draft: "draft",
  Issued: "issued",
} as const;
export type NoteStatus = (typeof NoteStatus)[keyof typeof NoteStatus];

/** A credit or debit note. Direction is carried by Document.type
 * (CREDIT_NOTE reduces, DEBIT_NOTE increases the referenced document). */
export interface Note {
  id: string;
  documentId: string;
  status: NoteStatus;
}

export const VendorBillPaymentStatus = {
  Succeeded: "succeeded",
  Failed: "failed",
  Canceled: "canceled",
} as const;
export type VendorBillPaymentStatus =
  (typeof VendorBillPaymentStatus)[keyof typeof VendorBillPaymentStatus];

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
  /** Lowercase ISO 4217 code the catalog price is denominated in. */
  currency: string;
  /** Opaque app-defined link to a host-app domain object (e.g. "experience"). */
  sourceType: string | null;
  /** Id of the linked source object, as a string. */
  sourceId: string | null;
  /** Which document side this product may appear on. Defaults to BOTH. */
  usage: ProductUsage;
  /** Optional purchase unit price (DecimalString), independent of the sale `price`. Null when unset. */
  cost: DecimalString | null;
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
  /** Snapshot of the parent document's currency at sale time. */
  currency: string;
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

export const FiscalStatus = {
  Pending: "pending",
  Accepted: "accepted",
  Rejected: "rejected",
  Conditional: "conditional",
  Contingency: "contingency",
} as const;
export type FiscalStatus = (typeof FiscalStatus)[keyof typeof FiscalStatus];

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
