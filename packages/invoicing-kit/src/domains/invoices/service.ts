import type { Repositories, DocumentUpdate, InvoiceWithDocument } from "../../adapters/types";
import type { AuthContext } from "../../auth/types";
import type { Invoice } from "../../types";
import { DocumentSide, DocumentType, ExchangeRateSource, InvoiceStatus, NoteStatus, QuoteStatus } from "../../types";
import type {
  CreateInvoiceBody,
  UpdateInvoiceBody,
  ListInvoicesQuery,
  ConvertFromQuoteBody,
  VoidInvoiceBody,
} from "./validation";
import {
  InvoiceNotFoundException,
  InvoiceNotDraftError,
  InvoiceIssueConflictError,
  InvoiceDraftConflictError,
  InvoiceNumberAlreadyExistsException,
  InvoiceCannotBeVoidedError,
  InvoiceHasPaymentsError,
  InvoiceHasCreditNoteError,
} from "./exceptions";
import { QuoteAlreadyConvertedException, QuoteNotAcceptedException, QuoteNotFoundException, QuoteStatusConflictException } from "../quotes/exceptions";
import { DocumentNumberingService } from "../../lib/numbering";
import { normalizeCurrency, DEFAULT_CURRENCY } from "../../lib/currency";
import { buildDocumentLines, lineInputsOf } from "../../lib/document-lines";
import { buildMoneySettings, type MoneySettings } from "../../lib/money/settings";
import type { DocumentServiceOptions } from "../../lib/document-issuance";
import { applyDocumentPlan, documentMoneyFields, planDocumentWrite } from "../../lib/document-issuance";
import type { InvoicingKitHooks } from "../../config";
import { emitInvoiceIssued } from "../../lib/hooks";
import type { InvoiceIssueGuard } from "../../config";
import { BillingDocumentInvariantError } from "../../lib/errors";
import { requirePaymentMethods, requireSalesClient } from "../../lib/sales-associations";
import { ClientNotFoundException } from "../clients/exceptions";

interface InvoiceServiceOptions extends DocumentServiceOptions {
  creditNotePrefix?: string | null;
  issueGuard?: InvoiceIssueGuard;
}

export class InvoiceService {
  private readonly hooks?: InvoicingKitHooks;
  private readonly money: MoneySettings;
  private readonly numbering: DocumentNumberingService;
  private readonly creditNotePrefix: string | null;
  private readonly issueGuard?: InvoiceIssueGuard;

  constructor(
    private readonly repos: Repositories,
    options: InvoiceServiceOptions = {},
  ) {
    this.hooks = options.hooks;
    this.money = options.money ?? buildMoneySettings();
    this.numbering = options.numbering ?? new DocumentNumberingService();
    this.creditNotePrefix = options.creditNotePrefix ?? null;
    this.issueGuard = options.issueGuard;
  }

  async create(body: CreateInvoiceBody, ctx: AuthContext): Promise<Invoice> {
    const currency = normalizeCurrency(body.currency ?? DEFAULT_CURRENCY);
    const issueDate = new Date(body.issueDate);
    const plan = await planDocumentWrite({
      money: this.money,
      organizationId: ctx.organizationId,
      existing: null,
      existingIsDraft: true,
      willBeDraft: true,
      currency,
      issueDate,
      requestedRate: body.exchangeRate,
    });

    const invoice = await this.repos.tx(async (tx) => {
      await requireSalesClient(tx, ctx.organizationId, body.clientId);
      await requirePaymentMethods(tx, ctx.organizationId, body.paymentMethodIds);
      const resolvedPrefix = body.documentNumberPrefix ?? null;

      const built = await buildDocumentLines({
        repos: tx,
        organizationId: ctx.organizationId,
        currency,
        side: DocumentSide.Sale,
        lineItems: body.lineItems,
        policy: plan.policy,
        exchangeRate: plan.exchange?.rate ?? null,
      });

      const doc = await tx.documents.create({
        type: DocumentType.Invoice,
        organizationId: ctx.organizationId,
        clientId: body.clientId,
        documentNumberPrefix: resolvedPrefix,
        documentNumber: null,
        documentNumberPadWidth: null,
        issueDate,
        dueDate: body.dueDate ? new Date(body.dueDate) : null,
        notes: body.notes ?? null,
        currency,
        ...built.totals,
        lineItems: built.lineItems,
        paymentMethodIds: body.paymentMethodIds,
        ...documentMoneyFields(plan, built.base),
      });

      return tx.invoices.create({
        documentId: doc.id,
        status: InvoiceStatus.Draft,
        subject: body.subject ?? null,
        paidDate: null,
        convertedFromQuoteId: null,
      });
    });
    return invoice;
  }

  async findById(id: string, ctx: AuthContext): Promise<InvoiceWithDocument> {
    const i = await this.repos.invoices.findById(id, ctx.organizationId);
    if (!i) throw InvoiceNotFoundException();
    return i;
  }

  async issue(id: string, ctx: AuthContext): Promise<InvoiceWithDocument> {
    const current = await this.repos.invoices.findById(id, ctx.organizationId);
    if (!current) throw InvoiceNotFoundException();
    if (current.status === InvoiceStatus.Issued) return current;
    if (current.status !== InvoiceStatus.Draft) throw new InvoiceNotDraftError();
    const plan = await planDocumentWrite({
      money: this.money,
      organizationId: ctx.organizationId,
      existing: current.document,
      existingIsDraft: true,
      willBeDraft: false,
      currency: current.document.currency,
      issueDate: current.document.issueDate,
      requestedRate: undefined,
    });

    const newlyIssued = await this.repos.tx(async (tx) => {
      const invoice = await tx.invoices.findById(id, ctx.organizationId);
      if (!invoice) throw InvoiceNotFoundException();
      if (invoice.status === InvoiceStatus.Issued) return false;
      if (invoice.status !== InvoiceStatus.Draft) throw new InvoiceNotDraftError();

      const claimed = await tx.invoices.transitionStatus(
        id,
        ctx.organizationId,
        InvoiceStatus.Draft,
        InvoiceStatus.Issued,
      );
      if (!claimed) throw new InvoiceIssueConflictError();

      const lockedInvoice = await tx.invoices.findById(id, ctx.organizationId);
      if (!lockedInvoice) throw InvoiceNotFoundException();
      if (lockedInvoice.document.updatedAt.getTime() !== current.document.updatedAt.getTime()) {
        throw new InvoiceIssueConflictError();
      }
      await this.issueGuard?.({ organizationId: ctx.organizationId, invoice: lockedInvoice });

      const patch = await applyDocumentPlan(tx, {
        document: lockedInvoice.document,
        organizationId: ctx.organizationId,
        side: DocumentSide.Sale,
        plan,
      });
      await tx.documents.update(lockedInvoice.documentId, ctx.organizationId, patch);

      if (lockedInvoice.document.documentNumber === null) {
        const prefix = lockedInvoice.document.documentNumberPrefix;
        const assigned = await this.numbering.next(tx, ctx.organizationId, DocumentType.Invoice, prefix);
        const existing = await tx.invoices.findByDocumentNumber({
          organizationId: ctx.organizationId,
          prefix,
          documentNumber: assigned.number,
        });
        if (existing) throw InvoiceNumberAlreadyExistsException();
        await tx.documents.update(lockedInvoice.documentId, ctx.organizationId, {
          documentNumber: assigned.number,
          documentNumberPadWidth: assigned.padWidth,
        });
      }

      return true;
    });

    if (newlyIssued) await emitInvoiceIssued(this.hooks, ctx.organizationId, id);
    return this.findById(id, ctx);
  }

  async void(id: string, body: VoidInvoiceBody, ctx: AuthContext) {
    const noteId = await this.repos.tx(async (tx) => {
      const invoice = await tx.invoices.findById(id, ctx.organizationId);
      if (!invoice) throw InvoiceNotFoundException();
      if (invoice.status !== InvoiceStatus.Sent) throw new InvoiceCannotBeVoidedError();

      const claimed = await tx.invoices.transitionStatus(
        id,
        ctx.organizationId,
        InvoiceStatus.Sent,
        InvoiceStatus.Voided,
      );
      if (!claimed) throw new InvoiceCannotBeVoidedError();

      const payments = await tx.payments.list({
        organizationId: ctx.organizationId,
        invoiceId: id,
        page: 1,
        perPage: 1,
      });
      if (payments.pageInfo.totalCount > 0) throw new InvoiceHasPaymentsError();

      const notes = await tx.notes.list({
        organizationId: ctx.organizationId,
        referencedDocumentId: invoice.documentId,
        type: DocumentType.CreditNote,
        page: 1,
        perPage: 1,
      });
      if (notes.pageInfo.totalCount > 0) throw new InvoiceHasCreditNoteError();

      const source = invoice.document;
      if (source.documentNumber === null || source.clientId === null ||
          source.subtotal === null || source.tax === null || source.total === null) {
        throw new BillingDocumentInvariantError("Issued invoice is missing its financial snapshot");
      }

      const assigned = await this.numbering.next(
        tx,
        ctx.organizationId,
        DocumentType.CreditNote,
        this.creditNotePrefix,
      );
      const creditNote = await tx.documents.create({
        type: DocumentType.CreditNote,
        organizationId: ctx.organizationId,
        clientId: source.clientId,
        referencedDocumentId: source.id,
        documentNumberPrefix: this.creditNotePrefix,
        documentNumber: assigned.number,
        documentNumberPadWidth: assigned.padWidth,
        issueDate: new Date(),
        notes: body.reason,
        currency: source.currency,
        subtotal: source.subtotal,
        tax: source.tax,
        total: source.total,
        moneyPolicy: source.moneyPolicy,
        baseCurrency: source.baseCurrency,
        exchangeRate: source.exchangeRate,
        exchangeRateDate: source.exchangeRateDate,
        exchangeRateSource: source.exchangeRateSource,
        baseSubtotal: source.baseSubtotal,
        baseTax: source.baseTax,
        baseTotal: source.baseTotal,
        lineItems: source.lineItems.map((line) => ({
          productId: line.productId,
          quantity: line.quantity,
          price: line.price,
          currency: line.currency,
          description: line.description,
          metadata: line.metadata,
          taxes: line.taxes.map((tax) => ({
            taxId: tax.taxId,
            taxAmount: tax.taxAmount,
            baseTaxAmount: tax.baseTaxAmount,
          })),
          taxAmount: line.taxAmount,
          total: line.total,
          baseSubtotal: line.baseSubtotal,
        })),
      });
      const note = await tx.notes.create({ documentId: creditNote.id, status: NoteStatus.Issued });
      return note.id;
    });

    if (this.hooks?.onNoteRecorded) {
      try {
        await this.hooks.onNoteRecorded({ organizationId: ctx.organizationId, noteId });
      } catch (error) {
        console.error("[invoicing-kit] onNoteRecorded handler failed", error);
      }
    }
    const invoice = await this.findById(id, ctx);
    const creditNote = await this.repos.notes.findById(noteId, ctx.organizationId);
    if (!creditNote) throw new BillingDocumentInvariantError("Voiding credit note was not persisted");
    return { invoice, creditNote };
  }

  async list(query: ListInvoicesQuery, ctx: AuthContext, invoiceIds?: readonly string[]) {
    return this.repos.invoices.list({
      organizationId: ctx.organizationId,
      invoiceIds,
      page: query.page,
      perPage: query.perPage,
      status: query.status,
      clientId: query.clientId,
      currency: query.currency,
      query: query.query,
      sortBy: query.sortBy,
      sortDir: query.sortDir,
      issueDateFrom: query.issueDateFrom ? new Date(query.issueDateFrom) : undefined,
      issueDateTo: query.issueDateTo ? new Date(query.issueDateTo) : undefined,
      dueBefore: query.dueBefore ? new Date(query.dueBefore) : undefined,
    });
  }

  async update(id: string, body: UpdateInvoiceBody, ctx: AuthContext): Promise<Invoice> {
    const current = await this.repos.invoices.findById(id, ctx.organizationId);
    if (!current) throw InvoiceNotFoundException();
    if (current.status !== InvoiceStatus.Draft) throw new InvoiceNotDraftError();
    const plan = await planDocumentWrite({
      money: this.money,
      organizationId: ctx.organizationId,
      existing: current.document,
      existingIsDraft: true,
      willBeDraft: true,
      currency: current.document.currency,
      issueDate: body.issueDate ? new Date(body.issueDate) : current.document.issueDate,
      requestedRate: body.exchangeRate,
    });

    await this.repos.tx(async (tx) => {
      const existing = await tx.invoices.findById(id, ctx.organizationId);
      if (!existing) throw InvoiceNotFoundException();
      if (existing.status !== InvoiceStatus.Draft) throw new InvoiceNotDraftError();
      if (body.clientId !== undefined) {
        await requireSalesClient(tx, ctx.organizationId, body.clientId);
      }
      if (body.paymentMethodIds !== undefined) {
        await requirePaymentMethods(tx, ctx.organizationId, body.paymentMethodIds);
      }
      const claimed = await tx.invoices.transitionStatus(
        id,
        ctx.organizationId,
        InvoiceStatus.Draft,
        InvoiceStatus.Draft,
      );
      if (!claimed) throw new InvoiceNotDraftError();
      if (existing.document.updatedAt.getTime() !== current.document.updatedAt.getTime()) {
        throw new InvoiceDraftConflictError();
      }

      if (body.subject !== undefined) {
        await tx.invoices.update(id, ctx.organizationId, { subject: body.subject });
      }

      // Patch document scalar fields.
      const documentUpdate: DocumentUpdate = {};
      if (body.clientId !== undefined) documentUpdate.clientId = body.clientId;
      if (body.documentNumberPrefix !== undefined)
        documentUpdate.documentNumberPrefix = body.documentNumberPrefix;
      if (body.issueDate !== undefined) documentUpdate.issueDate = new Date(body.issueDate);
      if (body.dueDate !== undefined) {
        documentUpdate.dueDate = body.dueDate === null ? null : new Date(body.dueDate);
      }
      if (body.notes !== undefined) documentUpdate.notes = body.notes;

      if (body.lineItems !== undefined || body.exchangeRate !== undefined) {
        const patch = await applyDocumentPlan(tx, {
          document: existing.document,
          organizationId: ctx.organizationId,
          side: DocumentSide.Sale,
          plan,
          lineItems: body.lineItems,
        });
        Object.assign(documentUpdate, patch);
      }

      if (body.paymentMethodIds !== undefined) {
        await tx.documents.setPaymentMethods(
          existing.documentId,
          ctx.organizationId,
          body.paymentMethodIds,
        );
      }

      if (Object.keys(documentUpdate).length > 0) {
        await tx.documents.update(existing.documentId, ctx.organizationId, documentUpdate);
      }
    });
    return this.findById(id, ctx);
  }

  async delete(id: string, ctx: AuthContext): Promise<void> {
    await this.repos.tx(async (tx) => {
      const i = await tx.invoices.findById(id, ctx.organizationId);
      if (!i) throw InvoiceNotFoundException();
      if (i.status !== InvoiceStatus.Draft) throw new InvoiceNotDraftError();
      const claimed = await tx.invoices.transitionStatus(
        id,
        ctx.organizationId,
        InvoiceStatus.Draft,
        InvoiceStatus.Draft,
      );
      if (!claimed) throw new InvoiceNotDraftError();
      await tx.invoices.delete(i.id, ctx.organizationId);
      await tx.documents.delete(i.documentId, ctx.organizationId);
    });
  }

  async bulkDelete(ids: string[], ctx: AuthContext): Promise<{ count: number }> {
    let count = 0;
    await this.repos.tx(async (tx) => {
      for (const id of ids) {
        const i = await tx.invoices.findById(id, ctx.organizationId);
        if (!i) continue;
        if (i.status !== InvoiceStatus.Draft) throw new InvoiceNotDraftError();
        const claimed = await tx.invoices.transitionStatus(
          id,
          ctx.organizationId,
          InvoiceStatus.Draft,
          InvoiceStatus.Draft,
        );
        if (!claimed) throw new InvoiceNotDraftError();
        await tx.invoices.delete(i.id, ctx.organizationId);
        await tx.documents.delete(i.documentId, ctx.organizationId);
        count++;
      }
    });
    return { count };
  }

  async convertFromQuote(
    quoteId: string,
    body: ConvertFromQuoteBody,
    ctx: AuthContext,
  ): Promise<Invoice> {
    const quote = await this.repos.quotes.findById(quoteId, ctx.organizationId);
    if (!quote) throw QuoteNotFoundException();
    // The quote's agreed (manual) rate carries over to the invoice draft.
    const quotedRate =
      quote.document.exchangeRateSource === ExchangeRateSource.Manual ? quote.document.exchangeRate : undefined;
    const plan = await planDocumentWrite({
      money: this.money,
      organizationId: ctx.organizationId,
      existing: null,
      existingIsDraft: true,
      willBeDraft: true,
      currency: quote.document.currency,
      issueDate: new Date(),
      requestedRate: quotedRate ?? undefined,
    });

    return this.repos.tx(async (tx) => {
      const current = await tx.quotes.findById(quoteId, ctx.organizationId);
      if (!current) throw QuoteNotFoundException();
      if (current.status === QuoteStatus.Converted) throw QuoteAlreadyConvertedException();
      if (current.status !== QuoteStatus.Accepted) throw QuoteNotAcceptedException();
      if (!current.document.clientId) throw ClientNotFoundException();
      await requireSalesClient(tx, ctx.organizationId, current.document.clientId);
      await requirePaymentMethods(tx, ctx.organizationId, body.paymentMethodIds ?? []);
      const claimed = await tx.quotes.transitionStatus(
        quoteId,
        ctx.organizationId,
        QuoteStatus.Accepted,
        QuoteStatus.Converted,
      );
      if (!claimed) throw QuoteStatusConflictException();

      const built = await buildDocumentLines({
        repos: tx,
        organizationId: ctx.organizationId,
        currency: current.document.currency,
        side: DocumentSide.Sale,
        lineItems: lineInputsOf(current.document),
        policy: plan.policy,
        exchangeRate: null,
      });

      const doc = await tx.documents.create({
        type: DocumentType.Invoice,
        organizationId: ctx.organizationId,
        clientId: current.document.clientId,
        documentNumberPrefix: null,
        documentNumber: null,
        documentNumberPadWidth: null,
        issueDate: new Date(),
        notes: current.document.notes,
        currency: current.document.currency,
        ...built.totals,
        lineItems: built.lineItems,
        paymentMethodIds: body.paymentMethodIds ?? [],
        ...documentMoneyFields(plan, built.base),
      });

      const invoice = await tx.invoices.create({
        documentId: doc.id,
        status: InvoiceStatus.Draft,
        subject: current.subject,
        paidDate: null,
        convertedFromQuoteId: current.id,
      });
      return invoice;
    });
  }
}
