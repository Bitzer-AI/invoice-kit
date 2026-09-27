import type { NoteWithDocument, Repositories } from "../adapters/types";
import { DocumentType, InvoiceStatus, VendorBillStatus } from "../types";
import type { BigintMinor } from "../types";

/** What settles a document: payments, plus issued credit notes minus issued debit notes (`noted`). */
export interface Settlement {
  total: BigintMinor;
  paid: BigintMinor;
  noted: BigintMinor;
}

export function isSettled({ total, paid, noted }: Settlement): boolean {
  return paid + noted >= total;
}

export function invoiceStatusFor(settlement: Settlement): InvoiceStatus {
  if (isSettled(settlement)) return InvoiceStatus.Paid;
  return settlement.paid > 0n ? InvoiceStatus.PartiallyPaid : InvoiceStatus.Sent;
}

export function vendorBillStatusFor(settlement: Settlement): VendorBillStatus {
  if (isSettled(settlement)) return VendorBillStatus.Paid;
  return settlement.paid > 0n ? VendorBillStatus.PartiallyPaid : VendorBillStatus.Received;
}

/** Re-derives the status of the invoice or vendor bill a note references, after that note changed. */
export async function resettleReference(
  tx: Repositories,
  note: Pick<NoteWithDocument, "referencedDocument">,
  organizationId: string,
): Promise<void> {
  const reference = note.referencedDocument;
  if (!reference?.entityId) return;

  if (reference.type === DocumentType.Invoice) {
    const invoice = await tx.invoices.findById(reference.entityId, organizationId);
    if (!invoice || invoice.status === InvoiceStatus.Draft) return;
    const status = invoiceStatusFor({
      total: invoice.document.total ?? 0n,
      paid: await tx.payments.totalPaidForInvoice(invoice.id, organizationId),
      noted: await tx.notes.netSettlementFor(invoice.documentId, organizationId),
    });
    if (status === invoice.status) return;
    await tx.invoices.update(
      invoice.id,
      organizationId,
      status === InvoiceStatus.Paid ? { status, paidDate: new Date() } : { status, paidDate: null },
    );
    return;
  }

  if (reference.type === DocumentType.VendorBill) {
    const bill = await tx.vendorBills.findById(reference.entityId, organizationId);
    if (!bill || bill.status === VendorBillStatus.Draft) return;
    const status = vendorBillStatusFor({
      total: bill.document.total ?? 0n,
      paid: await tx.vendorBillPayments.totalPaidForBill(bill.id, organizationId),
      noted: await tx.notes.netSettlementFor(bill.documentId, organizationId),
    });
    if (status !== bill.status) await tx.vendorBills.update(bill.id, organizationId, { status });
  }
}
