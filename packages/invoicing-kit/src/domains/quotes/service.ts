import type { DocumentUpdate, QuoteUpdate, Repositories } from "../../adapters/types";
import type { QuoteWithDocument } from "../../adapters/types";
import type { AuthContext } from "../../auth/types";
import type { AssignedDocumentNumber, Quote } from "../../types";
import { DocumentSide, DocumentType, QuoteStatus } from "../../types";
import type { CreateQuoteBody, UpdateQuoteBody, ListQuotesQuery } from "./validation";
import { QuoteAlreadyConvertedException, QuoteNotFoundException, QuoteNumberAlreadyExistsException, QuoteStatusConflictException } from "./exceptions";
import { DocumentNumberingService } from "../../lib/numbering";
import { normalizeCurrency, DEFAULT_CURRENCY } from "../../lib/currency";
import { buildDocumentLines } from "../../lib/document-lines";
import { buildMoneySettings, type MoneySettings } from "../../lib/money/settings";
import type { DocumentServiceOptions } from "../../lib/document-issuance";
import { applyDocumentPlan, documentMoneyFields, planDocumentWrite } from "../../lib/document-issuance";
import { requirePaymentMethods, requireSalesClient } from "../../lib/sales-associations";

export class QuoteService {
  private readonly money: MoneySettings;
  private readonly numbering: DocumentNumberingService;

  constructor(
    private readonly repos: Repositories,
    options: DocumentServiceOptions = {},
  ) {
    this.money = options.money ?? buildMoneySettings();
    this.numbering = options.numbering ?? new DocumentNumberingService();
  }

  async create(body: CreateQuoteBody, ctx: AuthContext): Promise<Quote> {
    // Quotes are never issued/frozen: every write plans as a draft, so it always
    // computes under the org's current policy. A manual rate is stored but not
    // converted with (the base amounts stay null until it becomes an invoice).
    const documentCurrency = normalizeCurrency(body.currency ?? DEFAULT_CURRENCY);
    const issueDate = new Date(body.issueDate);
    const plan = await planDocumentWrite({
      money: this.money,
      organizationId: ctx.organizationId,
      existing: null,
      existingIsDraft: true,
      willBeDraft: true,
      currency: documentCurrency,
      issueDate,
      requestedRate: body.exchangeRate,
    });

    return this.repos.tx(async (tx) => {
      await requireSalesClient(tx, ctx.organizationId, body.clientId);
      await requirePaymentMethods(tx, ctx.organizationId, body.paymentMethodIds);
      const resolvedPrefix = body.documentNumberPrefix ?? null;
      // A caller-supplied documentNumber is a one-off override for THIS document
      // (the series counter is left untouched); otherwise the series assigns it.
      let assigned: AssignedDocumentNumber;
      if (body.documentNumber === undefined) {
        assigned = await this.numbering.next(tx, ctx.organizationId, DocumentType.Quote, resolvedPrefix);
      } else {
        assigned = {
          number: body.documentNumber,
          padWidth: await this.numbering.padWidthFor(tx, ctx.organizationId, DocumentType.Quote, resolvedPrefix),
        };
      }
      // Pre-check uniqueness for the (org, prefix, number) tuple.
      const existing = await tx.quotes.findByDocumentNumber({
        organizationId: ctx.organizationId,
        prefix: resolvedPrefix,
        documentNumber: assigned.number,
      });
      if (existing) throw QuoteNumberAlreadyExistsException();

      // Compute line items with taxes.
      const built = await buildDocumentLines({
        repos: tx,
        organizationId: ctx.organizationId,
        currency: documentCurrency,
        side: DocumentSide.Sale,
        lineItems: body.lineItems,
        policy: plan.policy,
        exchangeRate: null,
      });

      const doc = await tx.documents.create({
        type: DocumentType.Quote,
        organizationId: ctx.organizationId,
        clientId: body.clientId,
        documentNumberPrefix: resolvedPrefix,
        documentNumber: assigned.number,
        documentNumberPadWidth: assigned.padWidth,
        issueDate,
        notes: body.notes ?? null,
        currency: documentCurrency,
        ...built.totals,
        lineItems: built.lineItems,
        paymentMethodIds: body.paymentMethodIds,
        ...documentMoneyFields(plan, null),
      });

      return tx.quotes.create({
        documentId: doc.id,
        status: body.status,
        subject: body.subject ?? null,
        validUntil: body.validUntil ? new Date(body.validUntil) : null,
      });
    });
  }

  async findById(id: string, ctx: AuthContext): Promise<QuoteWithDocument> {
    const q = await this.repos.quotes.findById(id, ctx.organizationId);
    if (!q) throw QuoteNotFoundException();
    return q;
  }

  async list(query: ListQuotesQuery, ctx: AuthContext, quoteIds?: readonly string[]) {
    return this.repos.quotes.list({
      organizationId: ctx.organizationId,
      quoteIds,
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
    });
  }

  async update(id: string, body: UpdateQuoteBody, ctx: AuthContext): Promise<Quote> {
    const current = await this.repos.quotes.findById(id, ctx.organizationId);
    if (!current) throw QuoteNotFoundException();

    // Quotes are never issued/frozen: a recompute plans as a draft, under the org's
    // current policy. Only a line or rate change recomputes; other edits keep the
    // stored amounts.
    const recompute = body.lineItems !== undefined || body.exchangeRate !== undefined;
    const plan = recompute
      ? await planDocumentWrite({
          money: this.money,
          organizationId: ctx.organizationId,
          existing: current.document,
          existingIsDraft: true,
          willBeDraft: true,
          currency: current.document.currency,
          issueDate: body.issueDate ? new Date(body.issueDate) : current.document.issueDate,
          requestedRate: body.exchangeRate,
        })
      : null;

    return this.repos.tx(async (tx) => {
      const existing = await tx.quotes.findById(id, ctx.organizationId);
      if (!existing) throw QuoteNotFoundException();
      if (existing.status === QuoteStatus.Converted) throw QuoteAlreadyConvertedException();
      if (body.clientId !== undefined) {
        await requireSalesClient(tx, ctx.organizationId, body.clientId);
      }
      if (body.paymentMethodIds !== undefined) {
        await requirePaymentMethods(tx, ctx.organizationId, body.paymentMethodIds);
      }
      const claimed = await tx.quotes.transitionStatus(
        id,
        ctx.organizationId,
        existing.status,
        existing.status,
      );
      if (!claimed) throw QuoteStatusConflictException();

      // Patch scalar quote fields.
      const quoteUpdate: QuoteUpdate = {};
      if (body.status !== undefined) quoteUpdate.status = body.status;
      if (body.subject !== undefined) quoteUpdate.subject = body.subject;
      if (body.validUntil !== undefined)
        quoteUpdate.validUntil = body.validUntil ? new Date(body.validUntil) : null;

      let updated: Quote = existing;
      if (Object.keys(quoteUpdate).length > 0) {
        const u = await tx.quotes.update(id, ctx.organizationId, quoteUpdate);
        updated = { ...existing, ...u };
      }

      // Patch document scalar fields.
      const documentUpdate: DocumentUpdate = {};
      if (body.clientId !== undefined) documentUpdate.clientId = body.clientId;
      if (body.documentNumberPrefix !== undefined)
        documentUpdate.documentNumberPrefix = body.documentNumberPrefix;
      if (body.documentNumber !== undefined)
        documentUpdate.documentNumber = body.documentNumber;
      if (body.documentNumberPrefix !== undefined &&
          body.documentNumberPrefix !== existing.document.documentNumberPrefix) {
        documentUpdate.documentNumberPadWidth = await this.numbering.padWidthFor(
          tx,
          ctx.organizationId,
          DocumentType.Quote,
          body.documentNumberPrefix,
        );
      }
      if (body.issueDate !== undefined) documentUpdate.issueDate = new Date(body.issueDate);
      if (body.notes !== undefined) documentUpdate.notes = body.notes;

      if (plan) {
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

      return updated;
    });
  }

  async delete(id: string, ctx: AuthContext): Promise<void> {
    await this.repos.tx(async (tx) => {
      const q = await tx.quotes.findById(id, ctx.organizationId);
      if (!q) throw QuoteNotFoundException();
      if (q.status === QuoteStatus.Converted) throw QuoteAlreadyConvertedException();
      const claimed = await tx.quotes.transitionStatus(
        id,
        ctx.organizationId,
        q.status,
        q.status,
      );
      if (!claimed) throw QuoteStatusConflictException();
      await tx.quotes.delete(q.id, ctx.organizationId);
      await tx.documents.delete(q.documentId, ctx.organizationId);
    });
  }

  async bulkDelete(ids: string[], ctx: AuthContext): Promise<{ count: number }> {
    let count = 0;
    await this.repos.tx(async (tx) => {
      for (const id of ids) {
        const q = await tx.quotes.findById(id, ctx.organizationId);
        if (!q) continue;
        if (q.status === QuoteStatus.Converted) throw QuoteAlreadyConvertedException();
        const claimed = await tx.quotes.transitionStatus(
          id,
          ctx.organizationId,
          q.status,
          q.status,
        );
        if (!claimed) throw QuoteStatusConflictException();
        await tx.quotes.delete(q.id, ctx.organizationId);
        await tx.documents.delete(q.documentId, ctx.organizationId);
        count++;
      }
    });
    return { count };
  }

  async bulkUpdateStatus(
    ids: string[],
    status: QuoteStatus,
    ctx: AuthContext,
  ): Promise<{ count: number }> {
    let count = 0;
    await this.repos.tx(async (tx) => {
      for (const id of ids) {
        const q = await tx.quotes.findById(id, ctx.organizationId);
        if (!q) continue;
        if (q.status === QuoteStatus.Converted) throw QuoteAlreadyConvertedException();
        const changed = await tx.quotes.transitionStatus(
          id,
          ctx.organizationId,
          q.status,
          status,
        );
        if (!changed) throw QuoteStatusConflictException();
        count++;
      }
    });
    return { count };
  }
}
