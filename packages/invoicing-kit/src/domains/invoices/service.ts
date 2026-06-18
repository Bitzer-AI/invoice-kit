import type { Repositories } from "../../adapters/types";
import type { InvoiceWithDocument } from "../../adapters/types";
import type { AuthContext } from "../../auth/types";
import type { Invoice } from "../../types";
import { DocumentSide, DocumentType, InvoiceStatus, QuoteStatus } from "../../types";
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
import { DocumentCalculator } from "../../lib/calculator";
import { DocumentNumberingService } from "../../lib/numbering";
import { TaxStrategy } from "../../lib/tax-strategy";
import { normalizeCurrency, DEFAULT_CURRENCY } from "../../lib/currency";
import { resolveLineItemProduct } from "../../lib/line-item";
import type { InvoicingKitHooks } from "../../config";

export class InvoiceService {
  constructor(
    private readonly repos: Repositories,
    private readonly calc = new DocumentCalculator(),
    private readonly numbering = new DocumentNumberingService(),
    private readonly tax = new TaxStrategy(),
    private readonly hooks?: InvoicingKitHooks,
  ) {}

  /**
   * Fire the onInvoiceIssued hook. Caller invokes this AFTER the repo
   * transaction commits. Wrapped so a throwing handler never fails the op.
   */
  private async emitIssued(organizationId: string, invoiceId: string): Promise<void> {
    if (!this.hooks?.onInvoiceIssued) return;
    try {
      await this.hooks.onInvoiceIssued({ organizationId, invoiceId });
    } catch (err) {
      console.error("[invoicing-kit] onInvoiceIssued handler failed", err);
    }
  }

  async create(body: CreateInvoiceBody, ctx: AuthContext): Promise<Invoice> {
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

      // Compute line items with taxes.
      const documentCurrency = normalizeCurrency(body.currency ?? DEFAULT_CURRENCY);
      const lineItems = [];
      for (const lineItem of body.lineItems) {
        const product = await resolveLineItemProduct(
          tx,
          ctx.organizationId,
          lineItem,
          documentCurrency,
          DocumentSide.Sale,
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
          metadata: lineItem.metadata ?? null,
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
        type: DocumentType.Invoice,
        organizationId: ctx.organizationId,
        clientId: body.clientId,
        documentNumberPrefix: resolvedPrefix,
        documentNumber: number,
        issueDate: new Date(body.issueDate),
        notes: body.notes ?? null,
        currency: documentCurrency,
        subtotal: docTotals.subtotal,
        tax: docTotals.tax,
        total: docTotals.total,
        lineItems,
        paymentMethodIds: body.paymentMethodIds,
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
      await this.emitIssued(ctx.organizationId, invoice.id);
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
    const { updated, wasDraft } = await this.repos.tx(async (tx) => {
      const existing = await tx.invoices.findById(id, ctx.organizationId);
      if (!existing) throw InvoiceNotFoundException();
      const wasDraft = existing.status === InvoiceStatus.Draft;

      // Patch scalar invoice fields.
      const invoiceUpdate: { status?: any; paidDate?: Date | null } = {};
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
      const documentUpdate: any = {};
      if (body.clientId !== undefined) documentUpdate.clientId = body.clientId;
      if (body.documentNumberPrefix !== undefined)
        documentUpdate.documentNumberPrefix = body.documentNumberPrefix;
      if (body.documentNumber !== undefined)
        documentUpdate.documentNumber = body.documentNumber;
      if (body.issueDate !== undefined) documentUpdate.issueDate = new Date(body.issueDate);
      if (body.notes !== undefined) documentUpdate.notes = body.notes;

      // If line items changed, recompute totals and replace.
      if (body.lineItems !== undefined) {
        const documentCurrency = normalizeCurrency(existing.document.currency);
        const lineItems = [];
        for (const lineItem of body.lineItems) {
          const product = await resolveLineItemProduct(
            tx,
            ctx.organizationId,
            lineItem,
            documentCurrency,
            DocumentSide.Sale,
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
            metadata: lineItem.metadata ?? null,
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
      await this.emitIssued(ctx.organizationId, updated.id);
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
    let count = 0;
    const issuedIds: string[] = [];
    await this.repos.tx(async (tx) => {
      for (const id of ids) {
        const i = await tx.invoices.findById(id, ctx.organizationId);
        if (!i) continue;
        const patch: { status: typeof status; paidDate?: Date | null } = { status };
        if (status === InvoiceStatus.Paid && i.paidDate === null) patch.paidDate = new Date();
        await tx.invoices.update(id, ctx.organizationId, patch);
        // First transition out of draft → issued.
        if (i.status === InvoiceStatus.Draft && status !== InvoiceStatus.Draft) issuedIds.push(id);
        count++;
      }
    });

    // Post-commit: emit once per invoice that transitioned out of draft.
    for (const id of issuedIds) {
      await this.emitIssued(ctx.organizationId, id);
    }
    return { count };
  }

  async convertFromQuote(
    quoteId: string,
    body: ConvertFromQuoteBody,
    ctx: AuthContext,
  ): Promise<Invoice> {
    return this.repos.tx(async (tx) => {
      const quote = await tx.quotes.findById(quoteId, ctx.organizationId);
      if (!quote) throw QuoteNotFoundException();
      if (quote.status === QuoteStatus.Converted) throw QuoteAlreadyConvertedException();

      const number = await this.numbering.next(tx, ctx.organizationId, DocumentType.Invoice, null);

      // Build line items by copying from the quote (no recomputation).
      const lineItems = quote.document.lineItems.map((lineItem) => ({
        productId: lineItem.productId,
        quantity: lineItem.quantity,
        price: lineItem.price,
        currency: lineItem.currency,
        description: lineItem.description ?? null,
        metadata: lineItem.metadata ?? null,
        taxes: lineItem.taxes.map((tax) => ({ taxId: tax.taxId, taxAmount: tax.taxAmount })),
        taxAmount: lineItem.taxAmount,
        total: lineItem.total,
      }));

      const doc = await tx.documents.create({
        type: DocumentType.Invoice,
        organizationId: ctx.organizationId,
        clientId: quote.document.clientId,
        documentNumberPrefix: null,
        documentNumber: number,
        issueDate: new Date(),
        notes: quote.document.notes,
        currency: quote.document.currency,
        subtotal: quote.document.subtotal!,
        tax: quote.document.tax!,
        total: quote.document.total!,
        lineItems,
        paymentMethodIds: body.paymentMethodIds ?? [],
      });

      const invoice = await tx.invoices.create({
        documentId: doc.id,
        status: InvoiceStatus.Draft,
        paidDate: null,
        convertedFromQuoteId: quote.id,
      });

      await tx.quotes.update(quote.id, ctx.organizationId, { status: QuoteStatus.Converted });

      return invoice;
    });
  }
}
