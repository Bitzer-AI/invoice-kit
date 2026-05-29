import type { Repositories } from "../../adapters/types";
import type { InvoiceWithDocument } from "../../adapters/types";
import type { AuthContext } from "../../auth/types";
import type { Invoice } from "../../types";
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
import { resolveLineItemProductId } from "../../lib/line-item";

export class InvoiceService {
  constructor(
    private readonly repos: Repositories,
    private readonly calc = new DocumentCalculator(),
    private readonly numbering = new DocumentNumberingService(),
    private readonly tax = new TaxStrategy(),
  ) {}

  async create(body: CreateInvoiceBody, ctx: AuthContext): Promise<Invoice> {
    return this.repos.tx(async (tx) => {
      const number = await this.numbering.next(
        tx,
        ctx.organizationId,
        "INVOICE",
        body.documentNumberPrefix ?? null,
      );
      // Pre-check uniqueness if a prefix is provided.
      const existing = await tx.invoices.findByDocumentNumber({
        organizationId: ctx.organizationId,
        prefix: body.documentNumberPrefix ?? null,
        documentNumber: number,
      });
      if (existing) throw InvoiceNumberAlreadyExistsException();

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
        type: "INVOICE",
        organizationId: ctx.organizationId,
        clientId: body.clientId,
        documentNumberPrefix: body.documentNumberPrefix ?? null,
        documentNumber: number,
        issueDate: new Date(body.issueDate),
        notes: body.notes ?? null,
        subtotal: docTotals.subtotal,
        tax: docTotals.tax,
        total: docTotals.total,
        lineItems,
        paymentMethodIds: body.paymentMethodIds,
      });

      // Default paidDate to now when status is "paid" and no paidDate provided.
      let paidDate: Date | null = body.paidDate ? new Date(body.paidDate) : null;
      if (body.status === "paid" && paidDate === null) {
        paidDate = new Date();
      }

      return tx.invoices.create({
        documentId: doc.id,
        status: body.status,
        paidDate,
        convertedFromQuoteId: null,
      });
    });
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
    });
  }

  async update(id: string, body: UpdateInvoiceBody, ctx: AuthContext): Promise<Invoice> {
    return this.repos.tx(async (tx) => {
      const existing = await tx.invoices.findById(id, ctx.organizationId);
      if (!existing) throw InvoiceNotFoundException();

      // Patch scalar invoice fields.
      const invoiceUpdate: { status?: any; paidDate?: Date | null } = {};
      if (body.status !== undefined) invoiceUpdate.status = body.status;
      if (body.paidDate !== undefined) {
        invoiceUpdate.paidDate = body.paidDate ? new Date(body.paidDate) : null;
      }

      // Auto-set paidDate when transitioning to "paid" and no paidDate supplied.
      if (
        body.status === "paid" &&
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
    const i = await this.findById(id, ctx);
    await this.repos.tx(async (tx) => {
      await tx.invoices.delete(i.id, ctx.organizationId);
      await tx.documents.delete(i.documentId, ctx.organizationId);
    });
  }

  async convertFromQuote(
    quoteId: string,
    body: ConvertFromQuoteBody,
    ctx: AuthContext,
  ): Promise<Invoice> {
    return this.repos.tx(async (tx) => {
      const quote = await tx.quotes.findById(quoteId, ctx.organizationId);
      if (!quote) throw QuoteNotFoundException();
      if (quote.status === "converted") throw QuoteAlreadyConvertedException();

      const number = await this.numbering.next(tx, ctx.organizationId, "INVOICE", null);

      // Build line items by copying from the quote (no recomputation).
      const lineItems = quote.document.lineItems.map((li) => ({
        productId: li.productId,
        quantity: li.quantity,
        price: li.price,
        description: li.description ?? null,
        taxes: li.taxes.map((t) => ({ taxId: t.taxId, taxAmount: t.taxAmount })),
        taxAmount: li.taxAmount,
        total: li.total,
      }));

      const doc = await tx.documents.create({
        type: "INVOICE",
        organizationId: ctx.organizationId,
        clientId: quote.document.clientId,
        documentNumberPrefix: null,
        documentNumber: number,
        issueDate: new Date(),
        notes: quote.document.notes,
        subtotal: quote.document.subtotal!,
        tax: quote.document.tax!,
        total: quote.document.total!,
        lineItems,
        paymentMethodIds: body.paymentMethodIds ?? [],
      });

      const invoice = await tx.invoices.create({
        documentId: doc.id,
        status: "draft",
        paidDate: null,
        convertedFromQuoteId: quote.id,
      });

      await tx.quotes.update(quote.id, ctx.organizationId, { status: "converted" });

      return invoice;
    });
  }
}
