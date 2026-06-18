import type { Repositories } from "../../adapters/types";
import type { AuthContext } from "../../auth/types";
import type { Payment } from "../../types";
import { InvoiceStatus, PaymentStatus } from "../../types";
import type { CreatePaymentBody } from "./validation";
import { InvoiceNotFoundException } from "../invoices/exceptions";
import {
  PaymentNotFoundException,
  PaymentAmountExceedsInvoiceTotalException,
} from "./exceptions";
import type { InvoicingKitHooks } from "../../config";

export class PaymentService {
  constructor(
    private readonly repos: Repositories,
    private readonly hooks?: InvoicingKitHooks,
  ) {}

  async recordManualPayment(
    invoiceId: string,
    body: CreatePaymentBody,
    ctx: AuthContext,
  ): Promise<Payment> {
    const payment = await this.repos.tx(async (tx) => {
      const invoice = await tx.invoices.findById(invoiceId, ctx.organizationId);
      if (!invoice) throw InvoiceNotFoundException();

      const invoiceTotal = invoice.document.total ?? 0n;
      const alreadyPaid = await tx.payments.totalPaidForInvoice(invoiceId, ctx.organizationId);
      const amount = BigInt(body.amount);
      if (alreadyPaid + amount > invoiceTotal) {
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
      if (newTotalPaid >= invoiceTotal) {
        await tx.invoices.update(invoiceId, ctx.organizationId, {
          status: InvoiceStatus.Paid,
          paidDate: new Date(),
        });
      } else if (newTotalPaid > 0n) {
        await tx.invoices.update(invoiceId, ctx.organizationId, {
          status: InvoiceStatus.PartiallyPaid,
        });
      }

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
    const payment = await this.findById(id, ctx);
    await this.repos.tx(async (tx) => {
      await tx.payments.delete(id, ctx.organizationId);
      const remaining = await tx.payments.totalPaidForInvoice(payment.invoiceId, ctx.organizationId);
      const inv = await tx.invoices.findById(payment.invoiceId, ctx.organizationId);
      if (!inv) return;
      const invoiceTotal = inv.document.total ?? 0n;
      const newStatus =
        remaining >= invoiceTotal
          ? InvoiceStatus.Paid
          : remaining > 0n
            ? InvoiceStatus.PartiallyPaid
            : InvoiceStatus.Sent;
      const updateData: { status: typeof newStatus; paidDate?: Date | null } = {
        status: newStatus,
      };
      if (newStatus !== InvoiceStatus.Paid) updateData.paidDate = null;
      await tx.invoices.update(payment.invoiceId, ctx.organizationId, updateData);
    });
  }
}
