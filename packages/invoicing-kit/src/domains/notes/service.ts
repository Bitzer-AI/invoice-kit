import type { Repositories, NoteWithDocument } from "../../adapters/types";
import type { AuthContext } from "../../auth/types";
import type { Note } from "../../types";
import type { CreateNoteBody, UpdateNoteBody, ListNotesQuery } from "./validation";
import {
  NoteNotFoundException,
  NoteReferencedDocumentNotFoundException,
  NoteReferencesNoteException,
  DocumentPartyInvalidException,
} from "./exceptions";
import { DocumentCalculator } from "../../lib/calculator";
import { DocumentNumberingService } from "../../lib/numbering";
import { TaxStrategy } from "../../lib/tax-strategy";
import { resolveLineItemProductId } from "../../lib/line-item";
import type { InvoicingKitHooks } from "../../config";

export class NoteService {
  constructor(
    private readonly repos: Repositories,
    private readonly calc = new DocumentCalculator(),
    private readonly numbering = new DocumentNumberingService(),
    private readonly tax = new TaxStrategy(),
    private readonly hooks?: InvoicingKitHooks,
  ) {}

  /** Fire onNoteRecorded after commit; never let a handler throw break the op. */
  private async emitRecorded(organizationId: string, noteId: string): Promise<void> {
    if (!this.hooks?.onNoteRecorded) return;
    try {
      await this.hooks.onNoteRecorded({ organizationId, noteId });
    } catch (err) {
      console.error("[invoicing-kit] onNoteRecorded handler failed", err);
    }
  }

  async create(body: CreateNoteBody, ctx: AuthContext): Promise<Note> {
    const note = await this.repos.tx(async (tx) => {
      // Resolve + validate the referenced document (party invariant).
      const ref = await tx.documents.findById(body.referencedDocumentId, ctx.organizationId);
      if (!ref) throw NoteReferencedDocumentNotFoundException();
      if (ref.type === "CREDIT_NOTE" || ref.type === "DEBIT_NOTE")
        throw NoteReferencesNoteException();

      const isSales = body.clientId != null;
      if (isSales && ref.type !== "INVOICE")
        throw DocumentPartyInvalidException("A client note must reference an INVOICE");
      if (!isSales && ref.type !== "VENDOR_BILL")
        throw DocumentPartyInvalidException("A vendor note must reference a VENDOR_BILL");

      const docType = body.noteType === "CREDIT" ? "CREDIT_NOTE" : "DEBIT_NOTE";
      const number = await this.numbering.next(tx, ctx.organizationId, docType, null);

      const lineItems = [];
      for (const li of body.lineItems) {
        const productId = await resolveLineItemProductId(tx, ctx.organizationId, li);
        const price = BigInt(li.price);
        const taxResult = await this.tax.computeForLine(tx, ctx.organizationId, {
          quantity: li.quantity,
          price,
          taxIds: li.taxIds,
        });
        const lineTotals = this.calc.lineTotal({
          quantity: li.quantity,
          price,
          taxAmount: taxResult.taxAmount,
        });
        lineItems.push({
          productId,
          quantity: li.quantity,
          price,
          description: li.description ?? null,
          taxes: taxResult.perTax,
          taxAmount: taxResult.taxAmount,
          total: lineTotals.total,
        });
      }

      const docTotals = this.calc.documentTotals(
        lineItems.map((li) => ({
          subtotal: li.total - li.taxAmount,
          taxAmount: li.taxAmount,
          total: li.total,
        })),
      );

      const doc = await tx.documents.create({
        type: docType,
        organizationId: ctx.organizationId,
        clientId: body.clientId ?? null,
        vendorId: body.vendorId ?? null,
        referencedDocumentId: body.referencedDocumentId,
        externalDocumentNumber: body.externalDocumentNumber ?? null,
        documentNumberPrefix: null,
        documentNumber: number,
        issueDate: new Date(body.issueDate),
        dueDate: body.dueDate ? new Date(body.dueDate) : null,
        notes: body.notes ?? null,
        currency: body.currency ?? "usd",
        subtotal: docTotals.subtotal,
        tax: docTotals.tax,
        total: docTotals.total,
        lineItems,
      });

      return tx.notes.create({ documentId: doc.id, status: body.status });
    });

    // Post-commit: a non-draft note is "recorded" the moment it's created.
    if (note.status !== "draft") {
      await this.emitRecorded(ctx.organizationId, note.id);
    }
    return note;
  }

  async findById(id: string, ctx: AuthContext): Promise<NoteWithDocument> {
    const n = await this.repos.notes.findById(id, ctx.organizationId);
    if (!n) throw NoteNotFoundException();
    return n;
  }

  async list(query: ListNotesQuery, ctx: AuthContext) {
    return this.repos.notes.list({
      organizationId: ctx.organizationId,
      page: query.page,
      perPage: query.perPage,
      status: query.status ? (query.status.split(",") as any) : undefined,
      type: query.type,
      clientId: query.clientId,
      vendorId: query.vendorId,
      referencedDocumentId: query.referencedDocumentId,
      query: query.query,
      sortBy: query.sortBy,
      sortDir: query.sortDir,
      issueDateFrom: query.issueDateFrom ? new Date(query.issueDateFrom) : undefined,
      issueDateTo: query.issueDateTo ? new Date(query.issueDateTo) : undefined,
    });
  }

  async update(id: string, body: UpdateNoteBody, ctx: AuthContext): Promise<Note> {
    const { updated, wasDraft } = await this.repos.tx(async (tx) => {
      const existing = await tx.notes.findById(id, ctx.organizationId);
      if (!existing) throw NoteNotFoundException();
      const wasDraft = existing.status === "draft";

      let updated: Note = {
        id: existing.id,
        documentId: existing.documentId,
        status: existing.status,
      };
      if (body.status !== undefined) {
        const u = await tx.notes.update(id, ctx.organizationId, { status: body.status });
        updated = { ...updated, ...u };
      }

      const documentUpdate: any = {};
      if (body.externalDocumentNumber !== undefined)
        documentUpdate.externalDocumentNumber = body.externalDocumentNumber;
      if (body.issueDate !== undefined) documentUpdate.issueDate = new Date(body.issueDate);
      if (body.dueDate !== undefined)
        documentUpdate.dueDate = body.dueDate ? new Date(body.dueDate) : null;
      if (body.notes !== undefined) documentUpdate.notes = body.notes;

      if (body.lineItems !== undefined) {
        const lineItems = [];
        for (const li of body.lineItems) {
          const productId = await resolveLineItemProductId(tx, ctx.organizationId, li);
          const price = BigInt(li.price);
          const taxResult = await this.tax.computeForLine(tx, ctx.organizationId, {
            quantity: li.quantity,
            price,
            taxIds: li.taxIds,
          });
          const lineTotals = this.calc.lineTotal({
            quantity: li.quantity,
            price,
            taxAmount: taxResult.taxAmount,
          });
          lineItems.push({
            productId,
            quantity: li.quantity,
            price,
            description: li.description ?? null,
            taxes: taxResult.perTax,
            taxAmount: taxResult.taxAmount,
            total: lineTotals.total,
          });
        }
        const docTotals = this.calc.documentTotals(
          lineItems.map((l) => ({
            subtotal: l.total - l.taxAmount,
            taxAmount: l.taxAmount,
            total: l.total,
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
    if (wasDraft && updated.status !== "draft") {
      await this.emitRecorded(ctx.organizationId, updated.id);
    }
    return updated;
  }

  async delete(id: string, ctx: AuthContext): Promise<void> {
    const n = await this.findById(id, ctx);
    await this.repos.tx(async (tx) => {
      await tx.notes.delete(n.id, ctx.organizationId);
      await tx.documents.delete(n.documentId, ctx.organizationId);
    });
  }
}
