import { describe, expect, test } from "vitest";
import { inMemoryAdapter } from "../../src/adapters/memory";
import { buildServices } from "../../src/services";
import { buildMoneySettings } from "../../src/lib/money/settings";
import { RECOMMENDED_MONEY_POLICY } from "../../src/lib/money";
import type { AuthContext } from "../../src/auth/types";

async function setup(policy?: typeof RECOMMENDED_MONEY_POLICY) {
  const repos = inMemoryAdapter();
  const services = buildServices(repos, undefined, buildMoneySettings(policy ? { moneyPolicy: () => policy } : {}));
  const ctx: AuthContext = { userId: "u", organizationId: "org", role: null };
  const client = await repos.clients.create({ organizationId: "org", name: "Hotel" });
  const tax = await repos.taxes.create({ organizationId: "org", name: "ITBIS", type: "PERCENTAGE", rate: "0.18" });
  return { repos, services, ctx, client, tax };
}

const line = (price: string, taxIds: string[] = []) => ({
  source: { type: "experience", id: `x-${price}`, name: "Tour" },
  quantity: "1.5",
  price,
  taxIds,
});

describe("document services compute under the organization's policy", () => {
  test("legacy default keeps truncation", async () => {
    const { services, ctx, client } = await setup();
    const invoice = await services.invoices.create(
      { clientId: client.id, issueDate: "2026-09-25", status: "draft", lineItems: [line("333")], paymentMethodIds: [] } as any,
      ctx,
    );
    const full = await services.invoices.findById(invoice.id, ctx);
    expect(full.document.subtotal).toBe(499n);
  });

  test("recommended policy rounds half-up and taxes at document level", async () => {
    const { services, ctx, client, tax } = await setup(RECOMMENDED_MONEY_POLICY);
    const invoice = await services.invoices.create(
      {
        clientId: client.id,
        issueDate: "2026-09-25",
        status: "draft",
        lineItems: [line("333", [tax.id]), line("334", [tax.id])],
        paymentMethodIds: [],
      } as any,
      ctx,
    );
    const full = await services.invoices.findById(invoice.id, ctx);
    expect(full.document.subtotal).toBe(1001n); // 1.5 × 333 = 499.5 → 500; 1.5 × 334 = 501
    expect(full.document.tax).toBe(180n); // round(1001 × 18%) = round(180.18)
    expect(full.document.total).toBe(1181n);
  });

  test("quotes, notes and vendor bills use the same builder", async () => {
    const { repos, services, ctx, client } = await setup(RECOMMENDED_MONEY_POLICY);
    const quote = await services.quotes.create(
      { clientId: client.id, issueDate: "2026-09-25", status: "draft", lineItems: [line("333")], paymentMethodIds: [] } as any,
      ctx,
    );
    expect((await services.quotes.findById(quote.id, ctx)).document.subtotal).toBe(500n);

    const vendor = await repos.vendors.create({ organizationId: "org", name: "Fuel Co" });
    const bill = await services.vendorBills.create(
      {
        vendorId: vendor.id,
        issueDate: "2026-09-25",
        status: "draft",
        lineItems: [{ source: { type: "expense", id: "fuel", name: "Fuel" }, quantity: "1.5", price: "333", taxIds: [] }],
      } as any,
      ctx,
    );
    expect((await services.vendorBills.findById(bill.id, ctx)).document.subtotal).toBe(500n);
  });
});
