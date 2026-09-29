import type { Repositories, NoteWithDocument, DocumentUpdate } from "../../adapters/types";
import type { AuthContext } from "../../auth/types";
import type { Note } from "../../types";
import { DocumentType, InvoiceStatus, NoteStatus, NoteType } from "../../types";
import type { CreateNoteBody, UpdateNoteBody, ListNotesQuery } from "./validation";
import {
  NoteNotFoundException,
  NoteNotDraftError,
  NotePartyMismatchError,
  NoteCurrencyMismatchError,
  NoteReferencedInvoiceNotIssuedError,
  NoteReferencedDocumentNotFoundException,
  NoteReferencesNoteException,
  DocumentPartyInvalidException,
} from "./exceptions";
import { DocumentNumberingService } from "../../lib/numbering";
import { normalizeCurrency } from "../../lib/currency";
import { noteSide } from "../../lib/line-item";
import { buildDocumentLines } from "../../lib/document-lines";
import { buildMoneySettings, type MoneySettings } from "../../lib/money/settings";
import type { DocumentServiceOptions } from "../../lib/document-issuance";
import { applyDocumentPlan, documentMoneyFields, isFrozen, planDocumentWrite } from "../../lib/document-issuance";
import { exchangeOf, DocumentCurrencyMismatchException, ExchangeRateNotApplicableException } from "../../lib/exchange";
import { resettleReference } from "../../lib/settlement";
import type { InvoicingKitHooks } from "../../config";

export class NoteService {
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
    // Resolve + validate the referenced document (party invariant) before planning:
    // the note's rate and policy, and its default currency, come from this document.
    const ref = await this.repos.documents.findById(body.referencedDocumentId, ctx.organizationId);
    if (!ref) throw NoteReferencedDocumentNotFoundException();
    if (ref.type === DocumentType.CreditNote || ref.type === DocumentType.DebitNote)
      throw NoteReferencesNoteException();

    const isSales = body.clientId != null;
    if (isSales && ref.type !== DocumentType.Invoice)
      throw DocumentPartyInvalidException("A client note must reference an INVOICE");
    if (!isSales && ref.type !== DocumentType.VendorBill)
      throw DocumentPartyInvalidException("A vendor note must reference a VENDOR_BILL");

    const referencedCurrency = normalizeCurrency(ref.currency);
    const currency = normalizeCurrency(body.currency ?? referencedCurrency);
    if (currency !== referencedCurrency) throw DocumentCurrencyMismatchException(currency, referencedCurrency);

    // A note inherits the reference's rate; it cannot supply its own while one is frozen.
    const refExchange = exchangeOf(ref);
    if (refExchange !== null && body.exchangeRate != null) throw ExchangeRateNotApplicableException(currency);

    const issueDate = new Date(body.issueDate);
    const plan = await planDocumentWrite({
      money: this.money,
      organizationId: ctx.organizationId,
      existing: null,
      existingIsDraft: true,
      willBeDraft: body.status === NoteStatus.Draft,
      currency,
      issueDate,
      requestedRate: body.exchangeRate,
      referenced: { exchange: refExchange, policy: ref.moneyPolicy },
    });

    const docType = body.noteType === NoteType.Credit ? DocumentType.CreditNote : DocumentType.DebitNote;
    const note = await this.repos.tx(async (tx) => {
      // Resolve + validate the referenced document (party invariant).
      const ref = await tx.documents.findById(body.referencedDocumentId, ctx.organizationId);
      if (!ref) throw NoteReferencedDocumentNotFoundException();
      if (ref.type === DocumentType.CreditNote || ref.type === DocumentType.DebitNote)
        throw NoteReferencesNoteException();

      const isSales = body.clientId != null;
      if (isSales && ref.type !== DocumentType.Invoice)
        throw DocumentPartyInvalidException("A client note must reference an INVOICE");
      if (!isSales && ref.type !== DocumentType.VendorBill)
        throw DocumentPartyInvalidException("A vendor note must reference a VENDOR_BILL");
      if (isSales && body.clientId !== ref.clientId) throw new NotePartyMismatchError();
      if (!isSales && body.vendorId !== ref.vendorId) throw new NotePartyMismatchError();

      if (ref.type === DocumentType.Invoice) {
        const invoice = await tx.invoices.findByDocumentId(ref.id, ctx.organizationId);
        if (!invoice) throw NoteReferencedDocumentNotFoundException();
        if (invoice.status === InvoiceStatus.Draft || invoice.status === InvoiceStatus.Voided) {
          throw new NoteReferencedInvoiceNotIssuedError();
        }
        const locked = await tx.invoices.transitionStatus(
          invoice.id,
          ctx.organizationId,
          invoice.status,
          invoice.status,
        );
        if (!locked) throw new NoteReferencedInvoiceNotIssuedError();
      }

      const assigned = await this.numbering.next(tx, ctx.organizationId, docType, null);
      const built = await buildDocumentLines({
        repos: tx,
        organizationId: ctx.organizationId,
        currency,
        side: noteSide(body),
        lineItems: body.lineItems,
        policy: plan.policy,
        exchangeRate: plan.exchange?.rate ?? null,
      });

      const doc = await tx.documents.create({
        type: docType,
        organizationId: ctx.organizationId,
        clientId: body.clientId ?? null,
        vendorId: body.vendorId ?? null,
        referencedDocumentId: body.referencedDocumentId,
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

      const created = await tx.notes.create({ documentId: doc.id, status: body.status });
      if (created.status === NoteStatus.Issued) {
        const withDocument = await tx.notes.findById(created.id, ctx.organizationId);
        if (withDocument) await resettleReference(tx, withDocument, ctx.organizationId);
      }
      return created;
    });

    // Post-commit: a non-draft note is "recorded" the moment it's created.
    if (note.status !== NoteStatus.Draft) {
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
      status: query.status,
      type: query.type,
      party: query.party,
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
    const current = await this.repos.notes.findById(id, ctx.organizationId);
    if (!current) throw NoteNotFoundException();
    const ref = current.document.referencedDocumentId
      ? await this.repos.documents.findById(current.document.referencedDocumentId, ctx.organizationId)
      : null;
    const refExchange = ref ? exchangeOf(ref) : null;

    // A note inherits the reference's rate; it cannot supply its own while one is frozen.
    if (refExchange !== null && body.exchangeRate != null) {
      throw ExchangeRateNotApplicableException(current.document.currency);
    }

    let plan = await planDocumentWrite({
      money: this.money,
      organizationId: ctx.organizationId,
      existing: current.document,
      existingIsDraft: current.status === NoteStatus.Draft,
      willBeDraft: (body.status ?? current.status) === NoteStatus.Draft,
      currency: current.document.currency,
      issueDate: body.issueDate ? new Date(body.issueDate) : current.document.issueDate,
      requestedRate: body.exchangeRate,
      referenced: ref ? { exchange: refExchange, policy: ref.moneyPolicy } : undefined,
    });

    const { updated, wasDraft } = await this.repos.tx(async (tx) => {
      const existing = await tx.notes.findById(id, ctx.organizationId);
      if (!existing) throw NoteNotFoundException();
      if (existing.status !== NoteStatus.Draft) throw new NoteNotDraftError();
      const wasDraft = existing.status === NoteStatus.Draft;

      // The plan above was resolved from a pre-transaction read. If the note was
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
          willBeDraft: (body.status ?? existing.status) === NoteStatus.Draft,
          currency: existing.document.currency,
          issueDate: body.issueDate ? new Date(body.issueDate) : existing.document.issueDate,
          requestedRate: body.exchangeRate,
          referenced: ref ? { exchange: refExchange, policy: ref.moneyPolicy } : undefined,
        });
      }

      let updated: Note = { id: existing.id, documentId: existing.documentId, status: existing.status };
      if (body.status !== undefined) {
        const patched = await tx.notes.update(id, ctx.organizationId, { status: body.status });
        updated = { ...updated, ...patched };
      }
      const documentUpdate: DocumentUpdate = {};
      if (body.externalDocumentNumber !== undefined)
        documentUpdate.externalDocumentNumber = body.externalDocumentNumber;
      if (body.issueDate !== undefined) documentUpdate.issueDate = new Date(body.issueDate);
      if (body.dueDate !== undefined) documentUpdate.dueDate = body.dueDate ? new Date(body.dueDate) : null;
      if (body.notes !== undefined) documentUpdate.notes = body.notes;

      // Unfrozen notes (drafts) follow the current policy on every write; frozen
      // ones recompute only when their lines change, at their frozen rate.
      if (body.lineItems !== undefined || !plan.frozen) {
        const patch = await applyDocumentPlan(tx, {
          document: existing.document,
          organizationId: ctx.organizationId,
          side: noteSide(existing.document),
          plan,
          lineItems: body.lineItems,
        });
        Object.assign(documentUpdate, patch);
      }

      if (Object.keys(documentUpdate).length > 0) {
        await tx.documents.update(existing.documentId, ctx.organizationId, documentUpdate);
      }

      if (updated.status === NoteStatus.Issued) {
        const withDocument = await tx.notes.findById(id, ctx.organizationId);
        if (withDocument) await resettleReference(tx, withDocument, ctx.organizationId);
      }

      return { updated, wasDraft };
    });

    // Post-commit: emit only on the first transition out of draft.
    if (wasDraft && updated.status !== NoteStatus.Draft) {
      await this.emitRecorded(ctx.organizationId, updated.id);
    }
    return updated;
  }

  async delete(id: string, ctx: AuthContext): Promise<void> {
    await this.repos.tx(async (tx) => {
      const n = await tx.notes.findById(id, ctx.organizationId);
      if (!n) throw NoteNotFoundException();
      if (n.status !== NoteStatus.Draft) throw new NoteNotDraftError();
      await tx.notes.delete(n.id, ctx.organizationId);
      await tx.documents.delete(n.documentId, ctx.organizationId);
    });
  }
}
