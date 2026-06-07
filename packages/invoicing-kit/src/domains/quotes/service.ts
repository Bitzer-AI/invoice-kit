import type { Repositories } from "../../adapters/types";
import type { QuoteWithDocument } from "../../adapters/types";
import type { AuthContext } from "../../auth/types";
import type { Quote } from "../../types";
import type { CreateQuoteBody, UpdateQuoteBody, ListQuotesQuery } from "./validation";
import { QuoteNotFoundException, QuoteNumberAlreadyExistsException } from "./exceptions";
import { DocumentCalculator } from "../../lib/calculator";
import { DocumentNumberingService } from "../../lib/numbering";
import { TaxStrategy } from "../../lib/tax-strategy";
import { resolveLineItemProductId } from "../../lib/line-item";

export class QuoteService {
  constructor(
    private readonly repos: Repositories,
    private readonly calc = new DocumentCalculator(),
    private readonly numbering = new DocumentNumberingService(),
    private readonly tax = new TaxStrategy(),
  ) {}

  async create(body: CreateQuoteBody, ctx: AuthContext): Promise<Quote> {
    return this.repos.tx(async (tx) => {
      const resolvedPrefix = body.documentNumberPrefix ?? null;
      // A caller-supplied documentNumber is a one-off override for THIS document
      // (the series counter is left untouched); otherwise the series assigns it.
      const number =
        body.documentNumber ??
        (await this.numbering.next(tx, ctx.organizationId, "QUOTE", resolvedPrefix));
      // Pre-check uniqueness for the (org, prefix, number) tuple.
      const existing = await tx.quotes.findByDocumentNumber({
        organizationId: ctx.organizationId,
        prefix: resolvedPrefix,
        documentNumber: number,
      });
      if (existing) throw QuoteNumberAlreadyExistsException();

      // Compute line items with taxes.
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
        type: "QUOTE",
        organizationId: ctx.organizationId,
        clientId: body.clientId,
        documentNumberPrefix: resolvedPrefix,
        documentNumber: number,
        issueDate: new Date(body.issueDate),
        notes: body.notes ?? null,
        currency: body.currency ?? "usd",
        subtotal: docTotals.subtotal,
        tax: docTotals.tax,
        total: docTotals.total,
        lineItems,
        paymentMethodIds: body.paymentMethodIds,
      });

      return tx.quotes.create({
        documentId: doc.id,
        status: body.status,
        validUntil: body.validUntil ? new Date(body.validUntil) : null,
      });
    });
  }

  async findById(id: string, ctx: AuthContext): Promise<QuoteWithDocument> {
    const q = await this.repos.quotes.findById(id, ctx.organizationId);
    if (!q) throw QuoteNotFoundException();
    return q;
  }

  async list(query: ListQuotesQuery, ctx: AuthContext) {
    return this.repos.quotes.list({
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
    });
  }

  async update(id: string, body: UpdateQuoteBody, ctx: AuthContext): Promise<Quote> {
    return this.repos.tx(async (tx) => {
      const existing = await tx.quotes.findById(id, ctx.organizationId);
      if (!existing) throw QuoteNotFoundException();

      // Patch scalar quote fields.
      const quoteUpdate: { status?: any; validUntil?: Date | null } = {};
      if (body.status !== undefined) quoteUpdate.status = body.status;
      if (body.validUntil !== undefined)
        quoteUpdate.validUntil = body.validUntil ? new Date(body.validUntil) : null;

      let updated: Quote = existing;
      if (Object.keys(quoteUpdate).length > 0) {
        const u = await tx.quotes.update(id, ctx.organizationId, quoteUpdate);
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
    const q = await this.findById(id, ctx);
    await this.repos.tx(async (tx) => {
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
        await tx.quotes.delete(q.id, ctx.organizationId);
        await tx.documents.delete(q.documentId, ctx.organizationId);
        count++;
      }
    });
    return { count };
  }

  async bulkUpdateStatus(
    ids: string[],
    status: "draft" | "sent" | "accepted" | "rejected",
    ctx: AuthContext,
  ): Promise<{ count: number }> {
    let count = 0;
    await this.repos.tx(async (tx) => {
      for (const id of ids) {
        const q = await tx.quotes.findById(id, ctx.organizationId);
        if (!q) continue;
        await tx.quotes.update(id, ctx.organizationId, { status });
        count++;
      }
    });
    return { count };
  }
}
