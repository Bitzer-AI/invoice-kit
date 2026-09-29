import type { Repositories } from "../../adapters/types";
import type { AuthContext } from "../../auth/types";
import type { Payment } from "../../types";
import { InvoiceStatus, PaymentStatus } from "../../types";
import type { CreatePaymentBody } from "./validation";
import { InvoiceNotFoundException } from "../invoices/exceptions";
import {
  PaymentNotFoundException,
  PaymentAmountExceedsInvoiceTotalException,
  PaymentCurrencyMismatchException,
  PaymentInvoiceNotIssuedException,
} from "./exceptions";
import type { InvoicingKitHooks } from "../../config";
import type { DocumentServiceOptions } from "../../lib/document-issuance";
import { invoiceStatusFor } from "../../lib/settlement";
import { normalizeCurrency } from "../../lib/currency";
import { requirePaymentMethods } from "../../lib/sales-associations";

export class PaymentService {
  private readonly hooks?: InvoicingKitHooks;

  constructor(
    private readonly repos: Repositories,
    options: DocumentServiceOptions = {},
  ) {
    this.hooks = options.hooks;
  }

  async recordManualPayment(
    invoiceId: string,
    body: CreatePaymentBody,
    ctx: AuthContext,
  ): Promise<Payment> {
    const amount = BigInt(body.amount);
    const payment = await this.repos.tx(async (tx) => {
      const invoice = await tx.invoices.findById(invoiceId, ctx.organizationId);
      if (!invoice) throw InvoiceNotFoundException();
      if (body.paymentMethodId !== null && body.paymentMethodId !== undefined) {
        await requirePaymentMethods(tx, ctx.organizationId, [body.paymentMethodId]);
      }
      if (
        invoice.status !== InvoiceStatus.Issued &&
        invoice.status !== InvoiceStatus.Sent &&
        invoice.status !== InvoiceStatus.PartiallyPaid
      ) {
        throw PaymentInvoiceNotIssuedException();
      }
      const locked = await tx.invoices.transitionStatus(
        invoiceId,
        ctx.organizationId,
        invoice.status,
        invoice.status,
      );
      if (!locked) throw PaymentInvoiceNotIssuedException();
      if (body.currency !== normalizeCurrency(invoice.document.currency)) {
        throw PaymentCurrencyMismatchException();
      }

      const invoiceTotal = invoice.document.total ?? 0n;
      const alreadyPaid = await tx.payments.totalPaidForInvoice(invoiceId, ctx.organizationId);
      const noted = await tx.notes.netSettlementFor(invoice.documentId, ctx.organizationId);
      if (alreadyPaid + amount + noted > invoiceTotal) {
        throw PaymentAmountExceedsInvoiceTotalException();
      }

      const created = await tx.payments.create({
        invoiceId,
        paymentMethodId: body.paymentMethodId ?? null,
        amount,
        currency: body.currency,
        status: PaymentStatus.Succeeded,
        provider: body.provider,
        paidAt: body.paidAt ? new Date(body.paidAt) : new Date(),
        reference: body.reference ?? null,
        notes: body.notes ?? null,
        recordedBy: ctx.userId,
      });

      const newTotalPaid = alreadyPaid + amount;
      const status = newTotalPaid + noted >= invoiceTotal ? InvoiceStatus.Paid : InvoiceStatus.PartiallyPaid;
      await tx.invoices.update(
        invoiceId,
        ctx.organizationId,
        status === InvoiceStatus.Paid ? { status, paidDate: new Date() } : { status },
      );

      return created;
    });

    if (this.hooks?.onPaymentSucceeded) {
      try {
        await this.hooks.onPaymentSucceeded({
          organizationId: ctx.organizationId,
          paymentId: payment.id,
        });
      } catch (err) {
        console.error("[invoicing-kit] onPaymentSucceeded handler failed", err);
      }
    }

    return payment;
  }

  async listForInvoice(invoiceId: string, ctx: AuthContext) {
    const invoice = await this.repos.invoices.findById(invoiceId, ctx.organizationId);
    if (!invoice) throw InvoiceNotFoundException();
    return this.repos.payments.list({ organizationId: ctx.organizationId, invoiceId });
  }

  async findById(id: string, ctx: AuthContext): Promise<Payment> {
    const p = await this.repos.payments.findById(id, ctx.organizationId);
    if (!p) throw PaymentNotFoundException();
    return p;
  }

  async delete(id: string, ctx: AuthContext): Promise<void> {
    await this.repos.tx(async (tx) => {
      const payment = await tx.payments.findById(id, ctx.organizationId);
      if (!payment) throw PaymentNotFoundException();
      const inv = await tx.invoices.findById(payment.invoiceId, ctx.organizationId);
      if (!inv) throw InvoiceNotFoundException();
      if (
        inv.status !== InvoiceStatus.Sent &&
        inv.status !== InvoiceStatus.Issued &&
        inv.status !== InvoiceStatus.Paid &&
        inv.status !== InvoiceStatus.PartiallyPaid
      ) {
        throw PaymentInvoiceNotIssuedException();
      }
      const locked = await tx.invoices.transitionStatus(
        inv.id,
        ctx.organizationId,
        inv.status,
        inv.status,
      );
      if (!locked) throw PaymentInvoiceNotIssuedException();
      await tx.payments.delete(id, ctx.organizationId);
      const remaining = await tx.payments.totalPaidForInvoice(payment.invoiceId, ctx.organizationId);
      const newStatus = invoiceStatusFor({
        total: inv.document.total ?? 0n,
        paid: remaining,
        noted: await tx.notes.netSettlementFor(inv.documentId, ctx.organizationId),
      });
      const updateData: { status: typeof newStatus; paidDate?: Date | null } = {
        status: newStatus,
      };
      if (newStatus !== InvoiceStatus.Paid) updateData.paidDate = null;
      await tx.invoices.update(payment.invoiceId, ctx.organizationId, updateData);
    });
  }
}
