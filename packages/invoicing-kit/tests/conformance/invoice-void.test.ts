import { expect, test } from "vitest";
import { describeForEachAdapter } from "./harness";
import { allFactories } from "./adapters";
import { z } from "zod";
import { parsedBody, seededKit, type SeededKit } from "./kit";
import { invoiceResponse } from "../../src/domains/invoices/validation";
import { noteResponse } from "../../src/domains/notes/validation";
import { DEFAULT_DOCUMENT_NUMBER_PAD_WIDTH, DOCUMENT_NUMBER_PREFIX_MAX_LENGTH } from "../../src/lib/numbering";
import { DocumentType, InvoiceStatus, NoteStatus, NoteType } from "../../src/types";

const REASON = "Issued to the wrong client";
const voidResponse = z.object({ invoice: invoiceResponse, creditNote: noteResponse });

async function issuedInvoice(kit: SeededKit) {
  const client = await kit.services.clients.create({ name: "Client" }, kit.ctx);
  const draft = await kit.services.invoices.create(
    {
      clientId: client.id,
      issueDate: "2026-03-01",
      paymentMethodIds: [],
      lineItems: [{ description: "Legal fees", quantity: "1", price: "100000", taxIds: [] }],
    },
    kit.ctx,
  );
  return kit.services.invoices.issue(draft.id, kit.ctx);
}

async function sentInvoice(kit: SeededKit) {
  const issued = await issuedInvoice(kit);
  await kit.repos.invoices.transitionStatus(issued.id, kit.organizationId, InvoiceStatus.Issued, InvoiceStatus.Sent);
  return issued;
}

const voidInvoice = (kit: SeededKit, invoiceId: string, body: unknown) => kit.post(`/invoices/${invoiceId}/void`, body);

const voided = async (kit: SeededKit, invoiceId: string, documentNumberPrefix: string | null) =>
  parsedBody(await voidInvoice(kit, invoiceId, { reason: REASON, documentNumberPrefix }), voidResponse);

const creditNoteSeries = (kit: SeededKit, prefix: string | null) =>
  kit.repos.documentSequences.find({
    organizationId: kit.organizationId,
    documentType: DocumentType.CreditNote,
    prefix,
  });

async function creditNotesOf(kit: SeededKit, documentId: string) {
  const page = await kit.repos.notes.list({ organizationId: kit.organizationId, referencedDocumentId: documentId });
  return page.data;
}

describeForEachAdapter("invoice void", allFactories, (ctx) => {
  test("a void with a prefix numbers the credit note in that series and stores the prefix", async () => {
    const kit = await seededKit(ctx.repos);
    const invoice = await sentInvoice(kit);

    const response = await voidInvoice(kit, invoice.id, { reason: REASON, documentNumberPrefix: "NC" });

    expect(response.status).toBe(200);
    const body = await parsedBody(response, voidResponse);
    expect(body.invoice.status).toBe(InvoiceStatus.Voided);
    expect(body.creditNote.status).toBe(NoteStatus.Issued);
    expect(body.creditNote.document).toMatchObject({
      type: DocumentType.CreditNote,
      referencedDocumentId: invoice.documentId,
      documentNumberPrefix: "NC",
      documentNumber: 1,
      documentNumberPadWidth: DEFAULT_DOCUMENT_NUMBER_PAD_WIDTH,
      notes: REASON,
      total: "100000",
      referencedDocument: {
        id: invoice.documentId,
        entityId: invoice.id,
        type: DocumentType.Invoice,
        documentNumberPrefix: null,
        documentNumber: 1,
        documentNumberPadWidth: DEFAULT_DOCUMENT_NUMBER_PAD_WIDTH,
      },
    });

    const stored = await kit.repos.notes.findById(body.creditNote.id, kit.organizationId);
    expect(stored?.document.documentNumberPrefix).toBe("NC");
    expect((await creditNoteSeries(kit, "NC"))?.nextNumber).toBe(2);
    expect(await creditNoteSeries(kit, null)).toBeNull();
  });

  test("a configured series gives its next number and its pad width to the credit note", async () => {
    const kit = await seededKit(ctx.repos);
    const invoice = await sentInvoice(kit);
    await kit.post("/document-number-sequence", {
      documentType: DocumentType.CreditNote,
      prefix: "B04",
      nextNumber: 120,
      padWidth: 10,
    });

    const body = await voided(kit, invoice.id, "B04");

    expect(body.creditNote.document).toMatchObject({
      documentNumberPrefix: "B04",
      documentNumber: 120,
      documentNumberPadWidth: 10,
    });
    expect((await creditNoteSeries(kit, "B04"))?.nextNumber).toBe(121);
  });

  test("a void with null uses the series with no prefix, the one a credit note from POST /notes uses", async () => {
    const kit = await seededKit(ctx.repos);
    const invoiceToVoid = await sentInvoice(kit);
    const credited = await issuedInvoice(kit);

    const body = await voided(kit, invoiceToVoid.id, null);
    const note = await parsedBody(
      await kit.post("/notes", {
        noteType: NoteType.Credit,
        referencedDocumentId: credited.documentId,
        clientId: credited.document.clientId,
        issueDate: "2026-03-02",
        lineItems: [{ description: "Discount", quantity: "1", price: "1000", taxIds: [] }],
      }),
      noteResponse,
    );

    expect(body.creditNote.document).toMatchObject({ documentNumberPrefix: null, documentNumber: 1 });
    expect(note.document).toMatchObject({ documentNumberPrefix: null, documentNumber: 2 });
    expect((await creditNoteSeries(kit, null))?.nextNumber).toBe(3);
  });

  test("two voids of two invoices in one series get consecutive numbers", async () => {
    const kit = await seededKit(ctx.repos);
    const first = await sentInvoice(kit);
    const second = await sentInvoice(kit);
    const otherSeries = await sentInvoice(kit);

    const firstBody = await voided(kit, first.id, "NC");
    const otherBody = await voided(kit, otherSeries.id, "ND");
    const secondBody = await voided(kit, second.id, "NC");

    expect(firstBody.creditNote.document.documentNumber).toBe(1);
    expect(secondBody.creditNote.document.documentNumber).toBe(2);
    expect(otherBody.creditNote.document).toMatchObject({ documentNumberPrefix: "ND", documentNumber: 1 });
  });

  test("a prefix is trimmed, and one of the maximum length is accepted", async () => {
    const kit = await seededKit(ctx.repos);
    const padded = await sentInvoice(kit);
    const longest = await sentInvoice(kit);
    const longestPrefix = "N".repeat(DOCUMENT_NUMBER_PREFIX_MAX_LENGTH);

    const paddedBody = await voided(kit, padded.id, "  NC  ");
    const longestBody = await voided(kit, longest.id, longestPrefix);

    expect(paddedBody.creditNote.document.documentNumberPrefix).toBe("NC");
    expect(longestBody.creditNote.document.documentNumberPrefix).toBe(longestPrefix);
  });

  test.each([
    ["no documentNumberPrefix", { reason: REASON }],
    ["an empty text", { reason: REASON, documentNumberPrefix: "" }],
    ["a blank text", { reason: REASON, documentNumberPrefix: "   " }],
    ["one character over the limit", { reason: REASON, documentNumberPrefix: "N".repeat(DOCUMENT_NUMBER_PREFIX_MAX_LENGTH + 1) }],
    ["a number", { reason: REASON, documentNumberPrefix: 4 }],
    ["an unknown field", { reason: REASON, documentNumberPrefix: "NC", series: "B04" }],
  ])("a void with %s is refused with 400 and voids nothing", async (_case, body) => {
    const kit = await seededKit(ctx.repos);
    const invoice = await sentInvoice(kit);

    const response = await voidInvoice(kit, invoice.id, body);

    expect(response.status).toBe(400);
    expect((await kit.services.invoices.findById(invoice.id, kit.ctx)).status).toBe(InvoiceStatus.Sent);
    expect(await creditNotesOf(kit, invoice.documentId)).toHaveLength(0);
    expect(await creditNoteSeries(kit, "NC")).toBeNull();
    expect(await creditNoteSeries(kit, null)).toBeNull();
  });

  test("an invoice that was issued and not sent is refused with 409 and takes no number", async () => {
    const kit = await seededKit(ctx.repos);
    const invoice = await issuedInvoice(kit);

    const response = await voidInvoice(kit, invoice.id, { reason: REASON, documentNumberPrefix: "NC" });

    expect(response.status).toBe(409);
    expect(await response.text()).toContain("INVOICE_STATUS_TRANSITION_INVALID");
    expect((await kit.services.invoices.findById(invoice.id, kit.ctx)).status).toBe(InvoiceStatus.Issued);
    expect(await creditNoteSeries(kit, "NC")).toBeNull();
  });

  test("a voided invoice cannot be voided again and keeps one credit note", async () => {
    const kit = await seededKit(ctx.repos);
    const invoice = await sentInvoice(kit);
    await voidInvoice(kit, invoice.id, { reason: REASON, documentNumberPrefix: "NC" });

    const again = await voidInvoice(kit, invoice.id, { reason: REASON, documentNumberPrefix: "NC" });

    expect(again.status).toBe(409);
    expect(await creditNotesOf(kit, invoice.documentId)).toHaveLength(1);
    expect((await creditNoteSeries(kit, "NC"))?.nextNumber).toBe(2);
  });

  test("each organization numbers its own credit note series", async () => {
    const firm = await seededKit(ctx.repos);
    const otherFirm = await seededKit(ctx.repos);
    const firmFirst = await sentInvoice(firm);
    const firmSecond = await sentInvoice(firm);
    const otherFirmInvoice = await sentInvoice(otherFirm);

    const first = await voided(firm, firmFirst.id, "NC");
    const other = await voided(otherFirm, otherFirmInvoice.id, "NC");
    const second = await voided(firm, firmSecond.id, "NC");

    expect(first.creditNote.document.documentNumber).toBe(1);
    expect(second.creditNote.document.documentNumber).toBe(2);
    expect(other.creditNote.document.documentNumber).toBe(1);
  });

  test("an organization cannot void the invoice of another one", async () => {
    const firm = await seededKit(ctx.repos);
    const otherFirm = await seededKit(ctx.repos);
    const invoice = await sentInvoice(firm);

    const response = await voidInvoice(otherFirm, invoice.id, { reason: REASON, documentNumberPrefix: "NC" });

    expect(response.status).toBe(404);
    expect((await firm.services.invoices.findById(invoice.id, firm.ctx)).status).toBe(InvoiceStatus.Sent);
    expect(await creditNotesOf(firm, invoice.documentId)).toHaveLength(0);
    expect(await creditNoteSeries(otherFirm, "NC")).toBeNull();
    expect(await creditNoteSeries(firm, "NC")).toBeNull();
  });
});
