import { describe, expect, test } from "vitest";
import { inMemoryAdapter } from "../../src/adapters/memory";
import { buildServices, type Services } from "../../src/services";
import { buildMoneySettings } from "../../src/lib/money/settings";
import { RECOMMENDED_MONEY_POLICY } from "../../src/lib/money";
import { ExchangeRateSource, NoteStatus, NoteType, VendorBillStatus } from "../../src/types";
import type { AuthContext } from "../../src/auth/types";

const ctx: AuthContext = { userId: "u", organizationId: "org", role: null };
let rate = "59.347";

const fuel = { source: { type: "expense", id: "fuel", name: "Fuel" }, quantity: "1", price: "100000", taxIds: [] };

async function setupDraftVendorBill(money: Parameters<typeof buildMoneySettings>[0]) {
  const repos = inMemoryAdapter();
  const services = buildServices(repos, undefined, buildMoneySettings(money));
  const vendor = await repos.vendors.create({ organizationId: "org", name: "Fuel Co" });
  const bill = await services.vendorBills.create(
    { vendorId: vendor.id, issueDate: "2026-09-01", currency: "usd", status: VendorBillStatus.Draft, lineItems: [fuel] },
    ctx,
  );
  const billDoc = (await services.vendorBills.findById(bill.id, ctx)).document;
  const note = (overrides: Record<string, unknown> = {}) =>
    ({
      noteType: NoteType.Credit,
      referencedDocumentId: billDoc.id,
      vendorId: vendor.id,
      issueDate: "2026-09-25",
      status: NoteStatus.Draft,
      lineItems: [{ ...fuel, price: "20000" }],
      ...overrides,
    }) as any;
  return { services, bill, note };
}

async function setup() {
  const repos = inMemoryAdapter();
  const services = buildServices(
    repos,
    undefined,
    buildMoneySettings({
      moneyPolicy: () => RECOMMENDED_MONEY_POLICY,
      exchangeRates: { baseCurrency: () => "dop", resolve: async () => rate },
    }),
  );
  const client = await repos.clients.create({ organizationId: "org", name: "Hotel" });
  const tour = { source: { type: "experience", id: "tour", name: "Tour" }, quantity: "1", price: "100000", taxIds: [] };
  const invoice = await services.invoices.create(
    { clientId: client.id, issueDate: "2026-09-01", currency: "usd", paymentMethodIds: [], lineItems: [tour] },
    ctx,
  );
  const invoiceDoc = (await services.invoices.issue(invoice.id, ctx)).document;
  const note = (overrides: Record<string, unknown> = {}) =>
    ({
      noteType: NoteType.Credit,
      referencedDocumentId: invoiceDoc.id,
      clientId: client.id,
      issueDate: "2026-09-25",
      status: NoteStatus.Issued,
      lineItems: [{ ...tour, price: "20000" }],
      ...overrides,
    }) as any;
  return { services, note, invoiceDoc };
}

describe("notes and exchange rates", () => {
  test("an issued note inherits the invoice's rate, not the note date's", async () => {
    rate = "59.347";
    const { services, note } = await setup();
    rate = "61";
    const created = await services.notes.create(note(), ctx);
    const doc = (await services.notes.findById(created.id, ctx)).document;
    expect(doc.currency).toBe("usd");
    expect(doc.exchangeRate).toBe("59.347");
    expect(doc.exchangeRateSource).toBe(ExchangeRateSource.Referenced);
    expect(doc.moneyPolicy).toEqual(RECOMMENDED_MONEY_POLICY);
    expect(doc.baseSubtotal).toBe(1_186_940n);
  });

  test("an explicit different currency is rejected and nothing is written", async () => {
    const { services, note } = await setup();
    await expect(services.notes.create(note({ currency: "eur" }), ctx)).rejects.toThrow(/CURRENCY_MISMATCH/);
    expect((await services.notes.list({} as any, ctx)).data).toHaveLength(0);
  });

  test("a note cannot override the referenced document's frozen rate (create)", async () => {
    rate = "59.347";
    const { services, note } = await setup();
    await expect(services.notes.create(note({ exchangeRate: "70" }), ctx)).rejects.toThrow(
      /EXCHANGE_RATE_NOT_APPLICABLE/,
    );
    expect((await services.notes.list({} as any, ctx)).data).toHaveLength(0);
  });

  test("a note cannot override the referenced document's frozen rate (update)", async () => {
    rate = "59.347";
    const { services, note } = await setup();
    const draft = await services.notes.create(note({ status: NoteStatus.Draft }), ctx);
    await expect(
      services.notes.update(draft.id, { exchangeRate: "70" } as any, ctx),
    ).rejects.toThrow(/EXCHANGE_RATE_NOT_APPLICABLE/);
    const doc = (await services.notes.findById(draft.id, ctx)).document;
    expect(doc.exchangeRate).toBeNull();
  });

  test("a note cannot reference a draft invoice", async () => {
    const repos = inMemoryAdapter();
    const services = buildServices(
      repos,
      undefined,
      buildMoneySettings({
        moneyPolicy: () => RECOMMENDED_MONEY_POLICY,
        exchangeRates: { baseCurrency: () => "dop", resolve: async () => rate },
      }),
    );
    const client = await repos.clients.create({ organizationId: "org", name: "Hotel" });
    const tour = { source: { type: "experience", id: "tour", name: "Tour" }, quantity: "1", price: "100000", taxIds: [] };
    const draftInvoice = await services.invoices.create(
      { clientId: client.id, issueDate: "2026-09-01", currency: "usd", paymentMethodIds: [], lineItems: [tour] },
      ctx,
    );
    const draftInvoiceDoc = (await services.invoices.findById(draftInvoice.id, ctx)).document;

    await expect(
      services.notes.create(
        {
          noteType: NoteType.Credit,
          referencedDocumentId: draftInvoiceDoc.id,
          clientId: client.id,
          issueDate: "2026-09-25",
          status: NoteStatus.Draft,
          lineItems: [{ ...tour, price: "20000" }],
        },
        ctx,
      ),
    ).rejects.toMatchObject({ status: 409, message: expect.stringContaining("NOTE_REFERENCED_INVOICE_NOT_ISSUED") });
    expect((await services.notes.list({} as any, ctx)).data).toHaveLength(0);
  });

  test("a manual rate is allowed when the referenced document carries no exchange (draft vendor bill)", async () => {
    const { services, note } = await setupDraftVendorBill({
      moneyPolicy: () => RECOMMENDED_MONEY_POLICY,
      exchangeRates: { baseCurrency: () => "dop", resolve: async () => rate },
    });

    const created = await services.notes.create(note({ status: NoteStatus.Issued, exchangeRate: "70" }), ctx);

    const doc = (await services.notes.findById(created.id, ctx)).document;
    expect(doc.exchangeRate).toBe("70");
    expect(doc.exchangeRateSource).toBe(ExchangeRateSource.Manual);
  });

  test("a draft note's own rate yields to the reference's rate once the reference is recorded", async () => {
    rate = "59.347";
    const { services, bill, note } = await setupDraftVendorBill({
      moneyPolicy: () => RECOMMENDED_MONEY_POLICY,
      exchangeRates: { baseCurrency: () => "dop", resolve: async () => rate },
    });
    const draftNote = await services.notes.create(note({ exchangeRate: "65" }), ctx);
    expect((await services.notes.findById(draftNote.id, ctx)).document.exchangeRate).toBe("65");
    await services.vendorBills.update(bill.id, { status: VendorBillStatus.Received }, ctx);

    await services.notes.update(draftNote.id, { status: NoteStatus.Issued }, ctx);

    const doc = (await services.notes.findById(draftNote.id, ctx)).document;
    expect(doc.exchangeRate).toBe("59.347");
    expect(doc.exchangeRateSource).toBe(ExchangeRateSource.Referenced);
    expect(doc.baseSubtotal).toBe(1_186_940n);
  });

  test("race: a line edit planned on a draft note is refused once a concurrent issue froze the note", async () => {
    const rates: Record<string, string | null> = { "2026-09-25": "59.347" };
    let noteId = "";
    let concurrentIssueDone = false;
    let services!: Services;
    const setupResult = await setupDraftVendorBill({
      moneyPolicy: async () => {
        if (noteId !== "" && !concurrentIssueDone) {
          concurrentIssueDone = true;
          await services.notes.update(noteId, { status: NoteStatus.Issued }, ctx);
        }
        return RECOMMENDED_MONEY_POLICY;
      },
      exchangeRates: {
        baseCurrency: () => "dop",
        resolve: async ({ date }) => rates[date.toISOString().slice(0, 10)] ?? null,
      },
    });
    services = setupResult.services;
    const draft = await services.notes.create(setupResult.note(), ctx);
    noteId = draft.id;

    await expect(
      services.notes.update(draft.id, { lineItems: [{ ...fuel, price: "30000" }] }, ctx),
    ).rejects.toMatchObject({ status: 409, message: expect.stringContaining("NOTE_NOT_DRAFT") });

    const found = await services.notes.findById(draft.id, ctx);
    expect(found.status).toBe(NoteStatus.Issued);
    expect(found.document.exchangeRate).toBe("59.347");
    expect(found.document.exchangeRateSource).toBe(ExchangeRateSource.Provider);
    expect(found.document.total).toBe(20_000n);
    expect(found.document.baseSubtotal).toBe(1_186_940n);
  });
});
