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
    const invoiceBody = (status: string) => ({
      clientId: client.id,
      issueDate: "2026-09-25",
      currency: "usd",
      status,
      lineItems: [{ source: { type: "experience", id: "tour", name: "Tour" }, quantity: "1", price: "100000", taxIds: [tax.id] }],
    });

    const sent = await (await post(invoiceBody("sent"))).json();
    expect(sent.document.exchangeRate).toBe("59.347");
    expect(sent.document.baseTotal).toBe("7002946");
    expect(sent.document.lineItems[0].baseSubtotal).toBe("5934700");
    expect(sent.document.lineItems[0].taxes[0].baseTaxAmount).toBe("1068246");

    rate = null;
    const draftRes = await post(invoiceBody("draft"));
    expect(draftRes.status).toBe(201);
    const draft = await draftRes.json();
    const issue = await h.app.request(`/api/bills/invoices/${draft.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ status: "sent" }),
    });
    expect(issue.status).toBe(422);
  });
});
