import type { Repositories } from "../../adapters/types";
import type { AuthContext } from "../../auth/types";
import type { VendorBillPayment } from "../../types";
import { VendorBillPaymentStatus, VendorBillStatus } from "../../types";
import type { CreateVendorBillPaymentBody } from "./validation";
import { VendorBillNotFoundException } from "../vendor-bills/exceptions";
import {
  VendorBillPaymentNotFoundException,
  VendorBillPaymentExceedsTotalException,
} from "./exceptions";
import type { InvoicingKitHooks } from "../../config";

export class VendorBillPaymentService {
  constructor(
    private readonly repos: Repositories,
    private readonly hooks?: InvoicingKitHooks,
  ) {}

  async recordManualVendorBillPayment(
    vendorBillId: string,
    body: CreateVendorBillPaymentBody,
    ctx: AuthContext,
  ): Promise<VendorBillPayment> {
    const payment = await this.repos.tx(async (tx) => {
      const bill = await tx.vendorBills.findById(vendorBillId, ctx.organizationId);
      if (!bill) throw VendorBillNotFoundException();

      const billTotal = bill.document.total ?? 0n;
      const alreadyPaid = await tx.vendorBillPayments.totalPaidForBill(
        vendorBillId,
        ctx.organizationId,
      );
      const amount = BigInt(body.amount);
      if (alreadyPaid + amount > billTotal) {
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

      const newTotalPaid = alreadyPaid + amount;
      if (newTotalPaid >= billTotal) {
        await tx.vendorBills.update(vendorBillId, ctx.organizationId, {
          status: VendorBillStatus.Paid,
        });
      } else if (newTotalPaid > 0n) {
        await tx.vendorBills.update(vendorBillId, ctx.organizationId, {
          status: VendorBillStatus.PartiallyPaid,
        });
      }

      return created;
    });

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
      if (!bill) return;
      const remaining = await tx.vendorBillPayments.totalPaidForBill(
        payment.vendorBillId,
        ctx.organizationId,
      );
      const billTotal = bill.document.total ?? 0n;
      // Reverting to "received" when nothing remains paid assumes the bill's
      // pre-payment state was "received" — valid under the current state machine
      // (you can't record a payment against a draft).
      const newStatus =
        remaining >= billTotal
          ? VendorBillStatus.Paid
          : remaining > 0n
            ? VendorBillStatus.PartiallyPaid
            : VendorBillStatus.Received;
      await tx.vendorBills.update(payment.vendorBillId, ctx.organizationId, { status: newStatus });
    });
  }
}
