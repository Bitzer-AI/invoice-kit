import { describe, expect, test } from "vitest";
import { inMemoryAdapter } from "../../src/adapters/memory";
import { buildServices, type Services } from "../../src/services";
import { buildMoneySettings } from "../../src/lib/money/settings";
import { RECOMMENDED_MONEY_POLICY } from "../../src/lib/money";
import { ExchangeRateSource, InvoiceStatus, NoteStatus, NoteType } from "../../src/types";
import type { AuthContext } from "../../src/auth/types";

const ctx: AuthContext = { userId: "u", organizationId: "org", role: null };
let rate = "59.347";

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
    { clientId: client.id, issueDate: "2026-09-01", currency: "usd", status: InvoiceStatus.Sent, paymentMethodIds: [], lineItems: [tour] } as any,
    ctx,
  );
  const invoiceDoc = (await services.invoices.findById(invoice.id, ctx)).document;
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

  test("a manual rate is allowed when the referenced document carries no exchange (draft reference)", async () => {
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
    // A draft invoice has no frozen exchange (moneyPolicy is null, exchangeRate is null).
    const draftInvoice = await services.invoices.create(
      { clientId: client.id, issueDate: "2026-09-01", currency: "usd", status: InvoiceStatus.Draft, paymentMethodIds: [], lineItems: [tour] } as any,
      ctx,
    );
    const draftInvoiceDoc = (await services.invoices.findById(draftInvoice.id, ctx)).document;

    const created = await services.notes.create(
      {
        noteType: NoteType.Credit,
        referencedDocumentId: draftInvoiceDoc.id,
        clientId: client.id,
        issueDate: "2026-09-25",
        status: NoteStatus.Issued,
        lineItems: [{ ...tour, price: "20000" }],
        exchangeRate: "70",
      } as any,
      ctx,
    );
    const doc = (await services.notes.findById(created.id, ctx)).document;
    expect(doc.exchangeRate).toBe("70");
    expect(doc.exchangeRateSource).toBe(ExchangeRateSource.Manual);
  });

  test("a draft note's own rate yields to the reference's rate once the reference is issued", async () => {
    rate = "59.347";
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
      { clientId: client.id, issueDate: "2026-09-01", currency: "usd", status: InvoiceStatus.Draft, paymentMethodIds: [], lineItems: [tour] } as any,
      ctx,
    );
    const invoiceDoc = (await services.invoices.findById(invoice.id, ctx)).document;
    const note = await services.notes.create(
      {
        noteType: NoteType.Credit,
        referencedDocumentId: invoiceDoc.id,
        clientId: client.id,
        issueDate: "2026-09-25",
        status: NoteStatus.Draft,
        lineItems: [{ ...tour, price: "20000" }],
        exchangeRate: "65",
      } as any,
      ctx,
    );
    await services.invoices.update(invoice.id, { status: InvoiceStatus.Sent } as any, ctx);

    await services.notes.update(note.id, { status: NoteStatus.Issued } as any, ctx);

    const doc = (await services.notes.findById(note.id, ctx)).document;
    expect(doc.exchangeRate).toBe("59.347");
    expect(doc.exchangeRateSource).toBe(ExchangeRateSource.Referenced);
    expect(doc.baseSubtotal).toBe(1_186_940n);
  });

  test("race: updating lines on what looks like a draft note doesn't null out a rate frozen by a concurrent issue", async () => {
    // The referenced invoice is left as a DRAFT (no frozen exchange), so the note's
    // own plan must go through `policyFor` (the injection point below) rather than
    // short-circuiting on the reference's policy.
    const rates: Record<string, string | null> = { "2026-09-25": "59.347" };
    const repos = inMemoryAdapter();
    let noteId = "";
    let sideEffectDone = false;
    let services!: Services;
    const money = buildMoneySettings({
      moneyPolicy: async () => {
        // Fires while `update()` below is planning its (line-item-only) write, which
        // still believes the note is an unrecorded draft. A concurrent process issues
        // the SAME note first, before this pre-transaction plan is applied.
        if (noteId !== "" && !sideEffectDone) {
          sideEffectDone = true;
          await services.notes.update(noteId, { status: NoteStatus.Issued } as any, ctx);
        }
        return RECOMMENDED_MONEY_POLICY;
      },
      exchangeRates: {
        baseCurrency: () => "dop",
        resolve: async ({ date }) => rates[date.toISOString().slice(0, 10)] ?? null,
      },
    });
    services = buildServices(repos, undefined, money);
    const client = await repos.clients.create({ organizationId: "org", name: "Hotel" });
    const tour = { source: { type: "experience", id: "tour", name: "Tour" }, quantity: "1", price: "100000", taxIds: [] };
    const invoice = await services.invoices.create(
      { clientId: client.id, issueDate: "2026-09-01", currency: "usd", status: InvoiceStatus.Draft, paymentMethodIds: [], lineItems: [tour] } as any,
      ctx,
    );
    const invoiceDoc = (await services.invoices.findById(invoice.id, ctx)).document;

    const draft = await services.notes.create(
      {
        noteType: NoteType.Credit,
        referencedDocumentId: invoiceDoc.id,
        clientId: client.id,
        issueDate: "2026-09-25",
        status: NoteStatus.Draft,
        lineItems: [{ ...tour, price: "20000" }],
      } as any,
      ctx,
    );
    noteId = draft.id;

    await services.notes.update(
      draft.id,
      { lineItems: [{ ...tour, price: "30000" }] } as any,
      ctx,
    );

    const found = await services.notes.findById(draft.id, ctx);
    expect(found.status).toBe(NoteStatus.Issued);
    expect(found.document.exchangeRate).toBe("59.347");
    // The reference (a draft invoice) carries no frozen exchange, so the note's own
    // rate was provider-resolved directly (not inherited) — but the important thing
    // this test pins is that it survived the race, frozen, unchanged by the re-plan.
    expect(found.document.exchangeRateSource).toBe(ExchangeRateSource.Provider);
    expect(found.document.baseSubtotal).not.toBeNull();
    // The line edit landed (recomputed under the frozen rate), it didn't just vanish.
    expect(found.document.total).toBe(30_000n);
    expect(found.document.baseSubtotal).toBe(1_780_410n);
  });
});
