import type { Repositories, VendorBillWithDocument, DocumentUpdate } from "../../adapters/types";
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
import { DocumentNumberingService } from "../../lib/numbering";
import { normalizeCurrency, DEFAULT_CURRENCY } from "../../lib/currency";
import { buildDocumentLines } from "../../lib/document-lines";
import { buildMoneySettings, type MoneySettings } from "../../lib/money/settings";
import type { DocumentServiceOptions } from "../../lib/document-issuance";
import { applyDocumentPlan, documentMoneyFields, isFrozen, planDocumentWrite } from "../../lib/document-issuance";
import type { InvoicingKitHooks } from "../../config";
import { emitVendorBillRecorded } from "../../lib/hooks";

export class VendorBillService {
  private readonly hooks?: InvoicingKitHooks;
  private readonly money: MoneySettings;
  private readonly numbering: DocumentNumberingService;

  constructor(
    private readonly repos: Repositories,
    options: DocumentServiceOptions = {},
  ) {
    this.hooks = options.hooks;
    this.money = options.money ?? buildMoneySettings();
    this.numbering = options.numbering ?? new DocumentNumberingService();
  }

  async create(body: CreateVendorBillBody, ctx: AuthContext): Promise<VendorBill> {
    const currency = normalizeCurrency(body.currency ?? DEFAULT_CURRENCY);
    const issueDate = new Date(body.issueDate);
    const plan = await planDocumentWrite({
      money: this.money,
      organizationId: ctx.organizationId,
      existing: null,
      existingIsDraft: true,
      willBeDraft: body.status === VendorBillStatus.Draft,
      currency,
      issueDate,
      requestedRate: body.exchangeRate,
    });

    const bill = await this.repos.tx(async (tx) => {
      // Party invariant: a vendor bill MUST reference an existing vendor.
      const vendor = await tx.vendors.findById(body.vendorId, ctx.organizationId);
      if (!vendor) throw VendorNotFoundException();

      // Internal-only document number (the user-facing reference is externalDocumentNumber).
      // The VENDOR_BILL series keeps the Document unique constraint satisfied without
      // exposing a kit-assigned number.
      const assigned = await this.numbering.next(tx, ctx.organizationId, DocumentType.VendorBill, null);

      const built = await buildDocumentLines({
        repos: tx,
        organizationId: ctx.organizationId,
        currency,
        side: DocumentSide.Purchase,
        lineItems: body.lineItems,
        policy: plan.policy,
        exchangeRate: plan.exchange?.rate ?? null,
      });

      const doc = await tx.documents.create({
        type: DocumentType.VendorBill,
        organizationId: ctx.organizationId,
        clientId: null,
        vendorId: body.vendorId,
        externalDocumentNumber: body.externalDocumentNumber ?? null,
        documentNumberPrefix: null,
        documentNumber: assigned.number,
        documentNumberPadWidth: assigned.padWidth,
        issueDate,
        dueDate: body.dueDate ? new Date(body.dueDate) : null,
        notes: body.notes ?? null,
        currency,
        ...built.totals,
        lineItems: built.lineItems,
        ...documentMoneyFields(plan, built.base),
      });

      return tx.vendorBills.create({ documentId: doc.id, status: body.status });
    });

    // Post-commit: a non-draft bill is "recorded" the moment it's created.
    if (bill.status !== VendorBillStatus.Draft) {
      await emitVendorBillRecorded(this.hooks, ctx.organizationId, bill.id);
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
    const current = await this.repos.vendorBills.findById(id, ctx.organizationId);
    if (!current) throw VendorBillNotFoundException();
    let plan = await planDocumentWrite({
      money: this.money,
      organizationId: ctx.organizationId,
      existing: current.document,
      existingIsDraft: current.status === VendorBillStatus.Draft,
      willBeDraft: (body.status ?? current.status) === VendorBillStatus.Draft,
      currency: current.document.currency,
      issueDate: body.issueDate ? new Date(body.issueDate) : current.document.issueDate,
      requestedRate: body.exchangeRate,
    });

    const { updated, wasDraft } = await this.repos.tx(async (tx) => {
      const existing = await tx.vendorBills.findById(id, ctx.organizationId);
      if (!existing) throw VendorBillNotFoundException();
      const wasDraft = existing.status === VendorBillStatus.Draft;

      // The plan above was resolved from a pre-transaction read. If the bill was
      // recorded by someone else in the meantime (still unfrozen in our plan, frozen
      // in the fresh read), re-plan from the fresh state. The frozen branch is pure
      // (no provider/policy call), so this still satisfies "resolve before the
      // transaction"; a requested exchangeRate now correctly throws EXCHANGE_RATE_FROZEN.
      if (!plan.frozen && isFrozen(existing.document, wasDraft)) {
        plan = await planDocumentWrite({
          money: this.money,
          organizationId: ctx.organizationId,
          existing: existing.document,
          existingIsDraft: wasDraft,
          willBeDraft: (body.status ?? existing.status) === VendorBillStatus.Draft,
          currency: existing.document.currency,
          issueDate: body.issueDate ? new Date(body.issueDate) : existing.document.issueDate,
          requestedRate: body.exchangeRate,
        });
      }

      let updated: VendorBill = existing;
      if (body.status !== undefined) {
        const patched = await tx.vendorBills.update(id, ctx.organizationId, { status: body.status });
        updated = { ...existing, ...patched };
      }

      const documentUpdate: DocumentUpdate = {};
      if (body.externalDocumentNumber !== undefined)
        documentUpdate.externalDocumentNumber = body.externalDocumentNumber;
      if (body.issueDate !== undefined) documentUpdate.issueDate = new Date(body.issueDate);
      if (body.dueDate !== undefined) documentUpdate.dueDate = body.dueDate ? new Date(body.dueDate) : null;
      if (body.notes !== undefined) documentUpdate.notes = body.notes;

      // Unfrozen bills (drafts) follow the current policy on every write; frozen
      // ones recompute only when their lines change, at their frozen rate.
      if (body.lineItems !== undefined || !plan.frozen) {
        const patch = await applyDocumentPlan(tx, {
          document: existing.document,
          organizationId: ctx.organizationId,
          side: DocumentSide.Purchase,
          plan,
          lineItems: body.lineItems,
        });
        Object.assign(documentUpdate, patch);
      }

      if (Object.keys(documentUpdate).length > 0) {
        await tx.documents.update(existing.documentId, ctx.organizationId, documentUpdate);
      }

      return { updated, wasDraft };
    });

    // Post-commit: emit only on the first transition out of draft.
    if (wasDraft && updated.status !== VendorBillStatus.Draft) {
      await emitVendorBillRecorded(this.hooks, ctx.organizationId, updated.id);
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
