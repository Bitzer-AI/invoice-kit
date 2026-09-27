import type { Repositories, DocumentUpdate, InvoiceWithDocument } from "../../adapters/types";
import type { AuthContext } from "../../auth/types";
import type { Invoice } from "../../types";
import { DocumentSide, DocumentType, ExchangeRateSource, InvoiceStatus, QuoteStatus } from "../../types";
import type {
  CreateInvoiceBody,
  UpdateInvoiceBody,
  ListInvoicesQuery,
  ConvertFromQuoteBody,
} from "./validation";
import {
  InvoiceNotFoundException,
  InvoiceNumberAlreadyExistsException,
  QuoteAlreadyConvertedException,
} from "./exceptions";
import { QuoteNotFoundException } from "../quotes/exceptions";
import { DocumentNumberingService } from "../../lib/numbering";
import { normalizeCurrency, DEFAULT_CURRENCY } from "../../lib/currency";
import { buildDocumentLines, lineInputsOf } from "../../lib/document-lines";
import { buildMoneySettings, type MoneySettings } from "../../lib/money/settings";
import type { DocumentServiceOptions, DocumentWritePlan } from "../../lib/document-issuance";
import { applyDocumentPlan, documentMoneyFields, isFrozen, planDocumentWrite } from "../../lib/document-issuance";
import type { InvoicingKitHooks } from "../../config";
import { emitInvoiceIssued } from "../../lib/hooks";

export class InvoiceService {
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

  async create(body: CreateInvoiceBody, ctx: AuthContext): Promise<Invoice> {
    const currency = normalizeCurrency(body.currency ?? DEFAULT_CURRENCY);
    const issueDate = new Date(body.issueDate);
    const plan = await planDocumentWrite({
      money: this.money,
      organizationId: ctx.organizationId,
      existing: null,
      existingIsDraft: true,
      willBeDraft: body.status === InvoiceStatus.Draft,
      currency,
      issueDate,
      requestedRate: body.exchangeRate,
    });

    const invoice = await this.repos.tx(async (tx) => {
      const resolvedPrefix = body.documentNumberPrefix ?? null;
      // A caller-supplied documentNumber is a one-off override for THIS document
      // (the series counter is left untouched); otherwise the series assigns it.
      const number =
        body.documentNumber ??
        (await this.numbering.next(tx, ctx.organizationId, DocumentType.Invoice, resolvedPrefix));
      // Pre-check uniqueness for the (org, prefix, number) tuple.
      const existing = await tx.invoices.findByDocumentNumber({
        organizationId: ctx.organizationId,
        prefix: resolvedPrefix,
        documentNumber: number,
      });
      if (existing) throw InvoiceNumberAlreadyExistsException();

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
        documentNumber: number,
        issueDate,
        notes: body.notes ?? null,
        currency,
        ...built.totals,
        lineItems: built.lineItems,
        paymentMethodIds: body.paymentMethodIds,
        ...documentMoneyFields(plan, built.base),
      });

      // Default paidDate to now when status is "paid" and no paidDate provided.
      let paidDate: Date | null = body.paidDate ? new Date(body.paidDate) : null;
      if (body.status === InvoiceStatus.Paid && paidDate === null) {
        paidDate = new Date();
      }

      return tx.invoices.create({
        documentId: doc.id,
        status: body.status,
        paidDate,
        convertedFromQuoteId: null,
      });
    });

    // Post-commit: a non-draft invoice is "issued" the moment it's created.
    if (invoice.status !== InvoiceStatus.Draft) {
      await emitInvoiceIssued(this.hooks, ctx.organizationId, invoice.id);
    }
    return invoice;
  }

  async findById(id: string, ctx: AuthContext): Promise<InvoiceWithDocument> {
    const i = await this.repos.invoices.findById(id, ctx.organizationId);
    if (!i) throw InvoiceNotFoundException();
    return i;
  }

  async list(query: ListInvoicesQuery, ctx: AuthContext) {
    return this.repos.invoices.list({
      organizationId: ctx.organizationId,
      page: query.page,
      perPage: query.perPage,
      status: query.status ? (query.status.split(",") as any) : undefined,
      clientId: query.clientId,
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
    let plan = await planDocumentWrite({
      money: this.money,
      organizationId: ctx.organizationId,
      existing: current.document,
      existingIsDraft: current.status === InvoiceStatus.Draft,
      willBeDraft: (body.status ?? current.status) === InvoiceStatus.Draft,
      currency: current.document.currency,
      issueDate: body.issueDate ? new Date(body.issueDate) : current.document.issueDate,
      requestedRate: body.exchangeRate,
    });

    const { updated, wasDraft } = await this.repos.tx(async (tx) => {
      const existing = await tx.invoices.findById(id, ctx.organizationId);
      if (!existing) throw InvoiceNotFoundException();
      const wasDraft = existing.status === InvoiceStatus.Draft;

      // The plan above was resolved from a pre-transaction read. If the document was
      // issued by someone else in the meantime (still unfrozen in our plan, frozen in
      // the fresh read), re-plan from the fresh state. The frozen branch is pure (no
      // provider/policy call), so this still satisfies "resolve before the transaction";
      // a requested exchangeRate now correctly throws EXCHANGE_RATE_FROZEN.
      if (!plan.frozen && isFrozen(existing.document, wasDraft)) {
        plan = await planDocumentWrite({
          money: this.money,
          organizationId: ctx.organizationId,
          existing: existing.document,
          existingIsDraft: wasDraft,
          willBeDraft: (body.status ?? existing.status) === InvoiceStatus.Draft,
          currency: existing.document.currency,
          issueDate: body.issueDate ? new Date(body.issueDate) : existing.document.issueDate,
          requestedRate: body.exchangeRate,
        });
      }

      // Patch scalar invoice fields.
      const invoiceUpdate: { status?: InvoiceStatus; paidDate?: Date | null } = {};
      if (body.status !== undefined) invoiceUpdate.status = body.status;
      if (body.paidDate !== undefined) {
        invoiceUpdate.paidDate = body.paidDate ? new Date(body.paidDate) : null;
      }

      // Auto-set paidDate when transitioning to "paid" and no paidDate supplied.
      if (
        body.status === InvoiceStatus.Paid &&
        body.paidDate === undefined &&
        existing.paidDate === null
      ) {
        invoiceUpdate.paidDate = new Date();
      }

      let updated: Invoice = existing;
      if (Object.keys(invoiceUpdate).length > 0) {
        const u = await tx.invoices.update(id, ctx.organizationId, invoiceUpdate);
        updated = { ...existing, ...u };
      }

      // Patch document scalar fields.
      const documentUpdate: DocumentUpdate = {};
      if (body.clientId !== undefined) documentUpdate.clientId = body.clientId;
      if (body.documentNumberPrefix !== undefined)
        documentUpdate.documentNumberPrefix = body.documentNumberPrefix;
      if (body.documentNumber !== undefined)
        documentUpdate.documentNumber = body.documentNumber;
      if (body.issueDate !== undefined) documentUpdate.issueDate = new Date(body.issueDate);
      if (body.notes !== undefined) documentUpdate.notes = body.notes;

      // Unfrozen documents (drafts) follow the current policy on every write;
      // frozen ones recompute only when their lines change, at their frozen rate.
      if (body.lineItems !== undefined || !plan.frozen) {
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

      return { updated, wasDraft };
    });

    // Post-commit: emit only on the first transition out of draft.
    if (wasDraft && updated.status !== InvoiceStatus.Draft) {
      await emitInvoiceIssued(this.hooks, ctx.organizationId, updated.id);
    }
    return updated;
  }

  async delete(id: string, ctx: AuthContext): Promise<void> {
    const i = await this.findById(id, ctx);
    await this.repos.tx(async (tx) => {
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
        await tx.invoices.delete(i.id, ctx.organizationId);
        await tx.documents.delete(i.documentId, ctx.organizationId);
        count++;
      }
    });
    return { count };
  }

  async bulkUpdateStatus(
    ids: string[],
    status: InvoiceStatus,
    ctx: AuthContext,
  ): Promise<{ count: number }> {
    // Plan every first issue before writing, so one missing rate fails the whole batch and changes nothing.
    const issuePlans = new Map<string, DocumentWritePlan>();
    if (status !== InvoiceStatus.Draft) {
      for (const id of ids) {
        const invoice = await this.repos.invoices.findById(id, ctx.organizationId);
        if (!invoice || invoice.status !== InvoiceStatus.Draft) continue;
        const plan = await planDocumentWrite({
          money: this.money,
          organizationId: ctx.organizationId,
          existing: invoice.document,
          existingIsDraft: true,
          willBeDraft: false,
          currency: invoice.document.currency,
          issueDate: invoice.document.issueDate,
          requestedRate: undefined,
        });
        if (plan.issuing) issuePlans.set(id, plan);
      }
    }

    let count = 0;
    const issuedIds: string[] = [];
    await this.repos.tx(async (tx) => {
      for (const id of ids) {
        const invoice = await tx.invoices.findById(id, ctx.organizationId);
        if (!invoice) continue;
        const patch: { status: InvoiceStatus; paidDate?: Date | null } = { status };
        if (status === InvoiceStatus.Paid && invoice.paidDate === null) patch.paidDate = new Date();
        await tx.invoices.update(id, ctx.organizationId, patch);
        const plan = issuePlans.get(id);
        // The plan was resolved from a pre-transaction read; only apply it if the
        // invoice is still an unfrozen draft (it may have been issued elsewhere since).
        if (plan && invoice.status === InvoiceStatus.Draft && !isFrozen(invoice.document, true)) {
          await this.freezeAtIssue(tx, invoice, plan, ctx.organizationId);
        }
        // First transition out of draft → issued.
        if (invoice.status === InvoiceStatus.Draft && status !== InvoiceStatus.Draft) issuedIds.push(id);
        count++;
      }
    });

    // Post-commit: emit once per invoice that transitioned out of draft.
    for (const id of issuedIds) {
      await emitInvoiceIssued(this.hooks, ctx.organizationId, id);
    }
    return { count };
  }

  /** Recomputes a draft's lines under its issue plan and stores the frozen policy, rate and base amounts. */
  private async freezeAtIssue(
    tx: Repositories,
    invoice: InvoiceWithDocument,
    plan: DocumentWritePlan,
    organizationId: string,
  ): Promise<void> {
    const patch = await applyDocumentPlan(tx, {
      document: invoice.document,
      organizationId,
      side: DocumentSide.Sale,
      plan,
    });
    await tx.documents.update(invoice.documentId, organizationId, patch);
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

      const number = await this.numbering.next(tx, ctx.organizationId, DocumentType.Invoice, null);
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
        documentNumber: number,
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
        paidDate: null,
        convertedFromQuoteId: current.id,
      });
      await tx.quotes.update(current.id, ctx.organizationId, { status: QuoteStatus.Converted });
      return invoice;
    });
  }
}
