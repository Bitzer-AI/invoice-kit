import { describe, expect, test } from "vitest";
import { createInvoicingKit, RECOMMENDED_MONEY_POLICY } from "../../src";
import { buildHarness } from "./harness";

describe("exchange rate over HTTP (prisma)", () => {
  test("issuing a USD invoice freezes rate and base amounts; draft saves without a rate", async () => {
    let rate: string | null = "59.347";
    const h = await buildHarness(createInvoicingKit, {
      moneyPolicy: () => RECOMMENDED_MONEY_POLICY,
      exchangeRates: { baseCurrency: () => "dop", resolve: async () => rate },
    });
    const client = await h.repos.clients.create({ organizationId: h.organizationId, name: "Hotel" });
    const tax = await h.repos.taxes.create({ organizationId: h.organizationId, name: "ITBIS", type: "PERCENTAGE", rate: "0.18" });
    const post = (body: unknown) =>
      h.app.request("/api/bills/invoices", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    const invoiceBody = {
      clientId: client.id,
      issueDate: "2026-09-25",
      currency: "usd",
      lineItems: [{ source: { type: "experience", id: "tour", name: "Tour" }, quantity: "1", price: "100000", taxIds: [tax.id] }],
    };
    const issue = (invoiceId: string) => h.app.request(`/api/bills/invoices/${invoiceId}/issue`, { method: "POST" });

    const rated = await (await post(invoiceBody)).json();
    expect(rated.document.exchangeRate).toBeNull();
    expect(rated.document.baseTotal).toBeNull();

    const issued = await (await issue(rated.id)).json();
    expect(issued.status).toBe("issued");
    expect(issued.document.exchangeRate).toBe("59.347");
    expect(issued.document.baseTotal).toBe("7002946");
    expect(issued.document.lineItems[0].baseSubtotal).toBe("5934700");
    expect(issued.document.lineItems[0].taxes[0].baseTaxAmount).toBe("1068246");

    rate = null;
    const draftRes = await post(invoiceBody);
    expect(draftRes.status).toBe(201);
    const draft = await draftRes.json();
    const unrated = await issue(draft.id);
    expect(unrated.status).toBe(422);
    expect(await unrated.text()).toContain("EXCHANGE_RATE_REQUIRED");
    const stillDraft = await (await h.app.request(`/api/bills/invoices/${draft.id}`)).json();
    expect(stillDraft.status).toBe("draft");
    expect(stillDraft.document.documentNumber).toBeNull();
  });
});
