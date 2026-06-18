import type { Repositories, VendorBillWithDocument } from "../../adapters/types";
import type { AuthContext } from "../../auth/types";
import type { VendorBill } from "../../types";
import { DocumentSide, DocumentType, VendorBillStatus } from "../../types";
import type {
  CreateVendorBillBody,
  UpdateVendorBillBody,
  ListVendorBillsQuery,
} from "./validation";
import { VendorBillNotFoundException } from "./exceptions";
import { VendorNotFoundException } from "../vendors/exceptions";
import { DocumentCalculator } from "../../lib/calculator";
import { DocumentNumberingService } from "../../lib/numbering";
import { TaxStrategy } from "../../lib/tax-strategy";
import { normalizeCurrency, DEFAULT_CURRENCY } from "../../lib/currency";
import { resolveLineItemProduct } from "../../lib/line-item";
import type { InvoicingKitHooks } from "../../config";

export class VendorBillService {
  constructor(
    private readonly repos: Repositories,
    private readonly calc = new DocumentCalculator(),
    private readonly numbering = new DocumentNumberingService(),
    private readonly tax = new TaxStrategy(),
    private readonly hooks?: InvoicingKitHooks,
  ) {}

  /** Fire onVendorBillRecorded after commit; never let a handler throw break the op. */
  private async emitRecorded(organizationId: string, vendorBillId: string): Promise<void> {
    if (!this.hooks?.onVendorBillRecorded) return;
    try {
      await this.hooks.onVendorBillRecorded({ organizationId, vendorBillId });
    } catch (err) {
      console.error("[invoicing-kit] onVendorBillRecorded handler failed", err);
    }
  }

  async create(body: CreateVendorBillBody, ctx: AuthContext): Promise<VendorBill> {
    const bill = await this.repos.tx(async (tx) => {
      // Party invariant: a vendor bill MUST reference an existing vendor.
      const vendor = await tx.vendors.findById(body.vendorId, ctx.organizationId);
      if (!vendor) throw VendorNotFoundException();

      // Internal-only document number (the user-facing reference is externalDocumentNumber).
      // The VENDOR_BILL series keeps the Document unique constraint satisfied without
      // exposing a kit-assigned number.
      const number = await this.numbering.next(tx, ctx.organizationId, DocumentType.VendorBill, null);

      const documentCurrency = normalizeCurrency(body.currency ?? DEFAULT_CURRENCY);
      const lineItems = [];
      for (const lineItem of body.lineItems) {
        const product = await resolveLineItemProduct(
          tx,
          ctx.organizationId,
          lineItem,
          documentCurrency,
          DocumentSide.Purchase,
        );
        const price = BigInt(lineItem.price);
        const taxResult = await this.tax.computeForLine(tx, ctx.organizationId, {
          quantity: lineItem.quantity,
          price,
          taxIds: lineItem.taxIds,
        });
        const lineTotals = this.calc.lineTotal({
          quantity: lineItem.quantity,
          price,
          taxAmount: taxResult.taxAmount,
        });
        lineItems.push({
          productId: product.id,
          quantity: lineItem.quantity,
          price,
          currency: documentCurrency,
          description: lineItem.description ?? null,
          taxes: taxResult.perTax,
          taxAmount: taxResult.taxAmount,
          total: lineTotals.total,
        });
      }

      const docTotals = this.calc.documentTotals(
        lineItems.map((line) => ({
          subtotal: line.total - line.taxAmount,
          taxAmount: line.taxAmount,
          total: line.total,
        })),
      );

      const doc = await tx.documents.create({
        type: DocumentType.VendorBill,
        organizationId: ctx.organizationId,
        clientId: null,
        vendorId: body.vendorId,
        externalDocumentNumber: body.externalDocumentNumber ?? null,
        documentNumberPrefix: null,
        documentNumber: number,
        issueDate: new Date(body.issueDate),
        dueDate: body.dueDate ? new Date(body.dueDate) : null,
        notes: body.notes ?? null,
        currency: documentCurrency,
        subtotal: docTotals.subtotal,
        tax: docTotals.tax,
        total: docTotals.total,
        lineItems,
      });

      return tx.vendorBills.create({ documentId: doc.id, status: body.status });
    });

    // Post-commit: a non-draft bill is "recorded" the moment it's created.
    if (bill.status !== VendorBillStatus.Draft) {
      await this.emitRecorded(ctx.organizationId, bill.id);
    }
    return bill;
  }

  async findById(id: string, ctx: AuthContext): Promise<VendorBillWithDocument> {
    const b = await this.repos.vendorBills.findById(id, ctx.organizationId);
    if (!b) throw VendorBillNotFoundException();
    return b;
  }

  async list(query: ListVendorBillsQuery, ctx: AuthContext) {
    return this.repos.vendorBills.list({
      organizationId: ctx.organizationId,
      page: query.page,
      perPage: query.perPage,
      status: query.status ? (query.status.split(",") as any) : undefined,
      vendorId: query.vendorId,
      query: query.query,
      sortBy: query.sortBy,
      sortDir: query.sortDir,
      issueDateFrom: query.issueDateFrom ? new Date(query.issueDateFrom) : undefined,
      issueDateTo: query.issueDateTo ? new Date(query.issueDateTo) : undefined,
    });
  }

  async update(id: string, body: UpdateVendorBillBody, ctx: AuthContext): Promise<VendorBill> {
    const { updated, wasDraft } = await this.repos.tx(async (tx) => {
      const existing = await tx.vendorBills.findById(id, ctx.organizationId);
      if (!existing) throw VendorBillNotFoundException();
      const wasDraft = existing.status === VendorBillStatus.Draft;

      let updated: VendorBill = existing;
      if (body.status !== undefined) {
        const u = await tx.vendorBills.update(id, ctx.organizationId, { status: body.status });
        updated = { ...existing, ...u };
      }

      const documentUpdate: any = {};
      if (body.externalDocumentNumber !== undefined)
        documentUpdate.externalDocumentNumber = body.externalDocumentNumber;
      if (body.issueDate !== undefined) documentUpdate.issueDate = new Date(body.issueDate);
      if (body.dueDate !== undefined)
        documentUpdate.dueDate = body.dueDate ? new Date(body.dueDate) : null;
      if (body.notes !== undefined) documentUpdate.notes = body.notes;

      if (body.lineItems !== undefined) {
        const documentCurrency = normalizeCurrency(existing.document.currency);
        const lineItems = [];
        for (const lineItem of body.lineItems) {
          const product = await resolveLineItemProduct(
            tx,
            ctx.organizationId,
            lineItem,
            documentCurrency,
            DocumentSide.Purchase,
          );
          const price = BigInt(lineItem.price);
          const taxResult = await this.tax.computeForLine(tx, ctx.organizationId, {
            quantity: lineItem.quantity,
            price,
            taxIds: lineItem.taxIds,
          });
          const lineTotals = this.calc.lineTotal({
            quantity: lineItem.quantity,
            price,
            taxAmount: taxResult.taxAmount,
          });
          lineItems.push({
            productId: product.id,
            quantity: lineItem.quantity,
            price,
            currency: documentCurrency,
            description: lineItem.description ?? null,
            taxes: taxResult.perTax,
            taxAmount: taxResult.taxAmount,
            total: lineTotals.total,
          });
        }
        const docTotals = this.calc.documentTotals(
          lineItems.map((line) => ({
            subtotal: line.total - line.taxAmount,
            taxAmount: line.taxAmount,
            total: line.total,
          })),
        );
        documentUpdate.subtotal = docTotals.subtotal;
        documentUpdate.tax = docTotals.tax;
        documentUpdate.total = docTotals.total;
        await tx.documents.replaceLineItems(existing.documentId, ctx.organizationId, lineItems);
      }

      if (Object.keys(documentUpdate).length > 0) {
        await tx.documents.update(existing.documentId, ctx.organizationId, documentUpdate);
      }

      return { updated, wasDraft };
    });

    // Post-commit: emit only on the first transition out of draft.
    if (wasDraft && updated.status !== VendorBillStatus.Draft) {
      await this.emitRecorded(ctx.organizationId, updated.id);
    }
    return updated;
  }

  async delete(id: string, ctx: AuthContext): Promise<void> {
    const b = await this.findById(id, ctx);
    await this.repos.tx(async (tx) => {
      await tx.vendorBills.delete(b.id, ctx.organizationId);
      await tx.documents.delete(b.documentId, ctx.organizationId);
    });
  }
}
