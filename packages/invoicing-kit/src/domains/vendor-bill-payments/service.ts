import type { Repositories } from "../../adapters/types";
import type { AuthContext } from "../../auth/types";
import type { VendorBillPayment } from "../../types";
import { DocumentSide, VendorBillPaymentStatus, VendorBillStatus } from "../../types";
import type { CreateVendorBillPaymentBody } from "./validation";
import { VendorBillNotFoundException } from "../vendor-bills/exceptions";
import {
  VendorBillPaymentNotFoundException,
  VendorBillPaymentExceedsTotalException,
} from "./exceptions";
import type { InvoicingKitHooks } from "../../config";
import { emitVendorBillRecorded } from "../../lib/hooks";
import { buildMoneySettings, type MoneySettings } from "../../lib/money/settings";
import type { DocumentPlanBuild, DocumentServiceOptions, DocumentWritePlan } from "../../lib/document-issuance";
import { buildDocumentPlan, isFrozen, planDocumentWrite, writeDocumentPlan } from "../../lib/document-issuance";
import { vendorBillStatusFor } from "../../lib/settlement";

export class VendorBillPaymentService {
  private readonly hooks?: InvoicingKitHooks;
  private readonly money: MoneySettings;

  constructor(
    private readonly repos: Repositories,
    options: DocumentServiceOptions = {},
  ) {
    this.hooks = options.hooks;
    this.money = options.money ?? buildMoneySettings();
  }

  async recordManualVendorBillPayment(
    vendorBillId: string,
    body: CreateVendorBillPaymentBody,
    ctx: AuthContext,
  ): Promise<VendorBillPayment> {
    // A payment that fully or partially pays a draft moves it off "draft" (spec §6:
    // "draft → non-draft" is a record/issue). Plan it BEFORE the transaction, same as
    // any other issue; a missing rate must reject the payment and write nothing. Plan
    // whenever the bill is a draft, full stop — not just when this payment looks (from
    // a pre-recompute total) like it will move it off draft: the recomputed total is
    // only known inside the transaction, so any total-based heuristic here would be
    // checking a total that's about to change.
    const forPlan = await this.repos.vendorBills.findById(vendorBillId, ctx.organizationId);
    if (!forPlan) throw VendorBillNotFoundException();
    const amount = BigInt(body.amount);
    let plan: DocumentWritePlan | null = null;
    if (forPlan.status === VendorBillStatus.Draft) {
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

    const { payment, recorded } = await this.repos.tx(async (tx) => {
      const bill = await tx.vendorBills.findById(vendorBillId, ctx.organizationId);
      if (!bill) throw VendorBillNotFoundException();

      // Build (but don't yet write) the recomputed lines/totals under the pre-resolved
      // plan, when it still applies (the bill may have been recorded elsewhere since
      // the plan was resolved). The amount check and the status decision below both
      // use this recomputed total, never the one stored before the recompute.
      let build: DocumentPlanBuild | null = null;
      if (plan && bill.status === VendorBillStatus.Draft && !isFrozen(bill.document, true)) {
        build = await buildDocumentPlan(tx, {
          document: bill.document,
          organizationId: ctx.organizationId,
          side: DocumentSide.Purchase,
          plan,
        });
      }

      const billTotal = build?.patch.total ?? bill.document.total ?? 0n;
      const alreadyPaid = await tx.vendorBillPayments.totalPaidForBill(
        vendorBillId,
        ctx.organizationId,
      );
      const noted =
        bill.status === VendorBillStatus.Draft
          ? 0n
          : await tx.notes.netSettlementFor(bill.documentId, ctx.organizationId);
      if (alreadyPaid + amount + noted > billTotal) {
        throw VendorBillPaymentExceedsTotalException();
      }

      const created = await tx.vendorBillPayments.create({
        organizationId: ctx.organizationId,
        vendorBillId,
        paymentMethodId: body.paymentMethodId ?? null,
        amount,
        currency: body.currency,
        status: VendorBillPaymentStatus.Succeeded,
        provider: body.provider,
        paidAt: body.paidAt ? new Date(body.paidAt) : new Date(),
        reference: body.reference ?? null,
        notes: body.notes ?? null,
        recordedBy: ctx.userId,
      });

      // Only a payment that actually moves this draft to PartiallyPaid/Paid is an
      // issue: write the recomputed lines and freeze the money fields exactly then.
      // A payment that leaves the bill a draft (e.g. 0 against a positive recomputed
      // total) writes nothing to the document — it must stay unfrozen.
      const newTotalPaid = alreadyPaid + amount;
      const status =
        newTotalPaid + noted >= billTotal
          ? VendorBillStatus.Paid
          : newTotalPaid > 0n
            ? VendorBillStatus.PartiallyPaid
            : null;
      if (status !== null) {
        if (build) await writeDocumentPlan(tx, bill.documentId, ctx.organizationId, build);
        await tx.vendorBills.update(vendorBillId, ctx.organizationId, { status });
      }

      return { payment: created, recorded: status !== null && bill.status === VendorBillStatus.Draft };
    });

    // The ledger posts the bill before its payment: recorded first.
    if (recorded) await emitVendorBillRecorded(this.hooks, ctx.organizationId, vendorBillId);
    if (this.hooks?.onVendorBillPaymentSucceeded) {
      try {
        await this.hooks.onVendorBillPaymentSucceeded({
          organizationId: ctx.organizationId,
          vendorBillPaymentId: payment.id,
        });
      } catch (err) {
        console.error("[invoicing-kit] onVendorBillPaymentSucceeded handler failed", err);
      }
    }

    return payment;
  }

  async listForBill(vendorBillId: string, ctx: AuthContext) {
    const bill = await this.repos.vendorBills.findById(vendorBillId, ctx.organizationId);
    if (!bill) throw VendorBillNotFoundException();
    return this.repos.vendorBillPayments.list({ organizationId: ctx.organizationId, vendorBillId });
  }

  async findById(id: string, ctx: AuthContext): Promise<VendorBillPayment> {
    const p = await this.repos.vendorBillPayments.findById(id, ctx.organizationId);
    if (!p) throw VendorBillPaymentNotFoundException();
    return p;
  }

  async delete(id: string, ctx: AuthContext): Promise<void> {
    const payment = await this.findById(id, ctx);
    await this.repos.tx(async (tx) => {
      await tx.vendorBillPayments.delete(id, ctx.organizationId);
      const bill = await tx.vendorBills.findById(payment.vendorBillId, ctx.organizationId);
      // A payment that left its bill a draft (a $0 one) never recorded it; deleting it doesn't either.
      if (!bill || bill.status === VendorBillStatus.Draft) return;
      const remaining = await tx.vendorBillPayments.totalPaidForBill(
        payment.vendorBillId,
        ctx.organizationId,
      );
      // Nothing left paid reverts to "received": a non-draft bill was recorded,
      // either before its first payment or by it.
      const newStatus = vendorBillStatusFor({
        total: bill.document.total ?? 0n,
        paid: remaining,
        noted: await tx.notes.netSettlementFor(bill.documentId, ctx.organizationId),
      });
      await tx.vendorBills.update(payment.vendorBillId, ctx.organizationId, { status: newStatus });
    });
  }
}
