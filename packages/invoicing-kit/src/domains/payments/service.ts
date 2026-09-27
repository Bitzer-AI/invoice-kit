import type { Repositories } from "../../adapters/types";
import type { AuthContext } from "../../auth/types";
import type { Payment } from "../../types";
import { DocumentSide, InvoiceStatus, PaymentStatus } from "../../types";
import type { CreatePaymentBody } from "./validation";
import { InvoiceNotFoundException } from "../invoices/exceptions";
import {
  PaymentNotFoundException,
  PaymentAmountExceedsInvoiceTotalException,
} from "./exceptions";
import type { InvoicingKitHooks } from "../../config";
import { emitInvoiceIssued } from "../../lib/hooks";
import { buildMoneySettings, type MoneySettings } from "../../lib/money/settings";
import type { DocumentPlanBuild, DocumentServiceOptions, DocumentWritePlan } from "../../lib/document-issuance";
import { buildDocumentPlan, isFrozen, planDocumentWrite, writeDocumentPlan } from "../../lib/document-issuance";
import { invoiceStatusFor } from "../../lib/settlement";

export class PaymentService {
  private readonly hooks?: InvoicingKitHooks;
  private readonly money: MoneySettings;

  constructor(
    private readonly repos: Repositories,
    options: DocumentServiceOptions = {},
  ) {
    this.hooks = options.hooks;
    this.money = options.money ?? buildMoneySettings();
  }

  async recordManualPayment(
    invoiceId: string,
    body: CreatePaymentBody,
    ctx: AuthContext,
  ): Promise<Payment> {
    // A payment that fully or partially pays a draft moves it off "draft" (spec §6:
    // "draft → non-draft" is an issue). Plan it BEFORE the transaction, same as any
    // other issue; a missing rate must reject the payment and write nothing. Plan
    // whenever the invoice is a draft, full stop — not just when this payment looks
    // (from a pre-recompute total) like it will move it off draft: the recomputed
    // total is only known inside the transaction, so any total-based heuristic here
    // would be checking a total that's about to change.
    const forPlan = await this.repos.invoices.findById(invoiceId, ctx.organizationId);
    if (!forPlan) throw InvoiceNotFoundException();
    const amount = BigInt(body.amount);
    let plan: DocumentWritePlan | null = null;
    if (forPlan.status === InvoiceStatus.Draft) {
      plan = await planDocumentWrite({
        money: this.money,
        organizationId: ctx.organizationId,
        existing: forPlan.document,
        existingIsDraft: true,
        willBeDraft: false,
        currency: forPlan.document.currency,
        issueDate: forPlan.document.issueDate,
        requestedRate: undefined,
      });
    }

    const { payment, issued } = await this.repos.tx(async (tx) => {
      const invoice = await tx.invoices.findById(invoiceId, ctx.organizationId);
      if (!invoice) throw InvoiceNotFoundException();

      // Build (but don't yet write) the recomputed lines/totals under the pre-resolved
      // plan, when it still applies (the invoice may have been issued elsewhere since
      // the plan was resolved). The amount check and the status decision below both
      // use this recomputed total, never the one stored before the recompute.
      let build: DocumentPlanBuild | null = null;
      if (plan && invoice.status === InvoiceStatus.Draft && !isFrozen(invoice.document, true)) {
        build = await buildDocumentPlan(tx, {
          document: invoice.document,
          organizationId: ctx.organizationId,
          side: DocumentSide.Sale,
          plan,
        });
      }

      const invoiceTotal = build?.patch.total ?? invoice.document.total ?? 0n;
      const alreadyPaid = await tx.payments.totalPaidForInvoice(invoiceId, ctx.organizationId);
      const noted =
        invoice.status === InvoiceStatus.Draft
          ? 0n
          : await tx.notes.netSettlementFor(invoice.documentId, ctx.organizationId);
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

      // Only a payment that actually moves this draft to Paid/PartiallyPaid is an
      // issue: write the recomputed lines and freeze the money fields exactly then.
      // A payment that leaves the invoice a draft (e.g. 0 against a positive
      // recomputed total) writes nothing to the document — it must stay unfrozen.
      const newTotalPaid = alreadyPaid + amount;
      const status =
        newTotalPaid + noted >= invoiceTotal
          ? InvoiceStatus.Paid
          : newTotalPaid > 0n
            ? InvoiceStatus.PartiallyPaid
            : null;
      if (status !== null) {
        if (build) await writeDocumentPlan(tx, invoice.documentId, ctx.organizationId, build);
        await tx.invoices.update(
          invoiceId,
          ctx.organizationId,
          status === InvoiceStatus.Paid ? { status, paidDate: new Date() } : { status },
        );
      }

      return { payment: created, issued: status !== null && invoice.status === InvoiceStatus.Draft };
    });

    // The ledger posts the invoice before its payment: issued first.
    if (issued) await emitInvoiceIssued(this.hooks, ctx.organizationId, invoiceId);
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
      // A payment that left its invoice a draft never issued it; deleting it doesn't either.
      if (!inv || inv.status === InvoiceStatus.Draft) return;
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
