import { describe, expect, test } from "vitest";
import { inMemoryAdapter } from "../../src/adapters/memory";
import { buildServices, type Services } from "../../src/services";
import { buildMoneySettings } from "../../src/lib/money/settings";
import { RECOMMENDED_MONEY_POLICY } from "../../src/lib/money";
import { ExchangeRateSource, VendorBillStatus } from "../../src/types";
import type { AuthContext } from "../../src/auth/types";

const ctx: AuthContext = { userId: "u", organizationId: "org", role: null };

async function setup(rate: string | null) {
  const repos = inMemoryAdapter();
  const services = buildServices(
    repos,
    undefined,
    buildMoneySettings({
      moneyPolicy: () => RECOMMENDED_MONEY_POLICY,
      exchangeRates: { baseCurrency: () => "dop", resolve: async () => rate },
    }),
  );
  const vendor = await repos.vendors.create({ organizationId: "org", name: "Fuel Co" });
  const body = (overrides: Record<string, unknown> = {}) =>
    ({
      vendorId: vendor.id,
      issueDate: "2026-09-20",
      currency: "usd",
      status: VendorBillStatus.Draft,
      lineItems: [{ source: { type: "expense", id: "fuel", name: "Fuel" }, quantity: "1", price: "5000", taxIds: [] }],
      ...overrides,
    }) as any;
  return { services, body };
}

describe("vendor bill exchange lifecycle", () => {
  test("recording a bill freezes the rate of the supplier's invoice date", async () => {
    const { services, body } = await setup("59.1");
    const bill = await services.vendorBills.create(body({ status: VendorBillStatus.Received }), ctx);
    const doc = (await services.vendorBills.findById(bill.id, ctx)).document;
    expect(doc.exchangeRate).toBe("59.1");
    expect(doc.baseSubtotal).toBe(295_500n);
  });

  test("draft saves without a rate; recording without one is 422", async () => {
    const { services, body } = await setup(null);
    const draft = await services.vendorBills.create(body(), ctx);
    await expect(
      services.vendorBills.update(draft.id, { status: VendorBillStatus.Received } as any, ctx),
    ).rejects.toThrow(/EXCHANGE_RATE_REQUIRED/);
  });

  test("the partner's own rate is used", async () => {
    const { services, body } = await setup("59.1");
    const bill = await services.vendorBills.create(body({ status: VendorBillStatus.Received, exchangeRate: "60" }), ctx);
    const doc = (await services.vendorBills.findById(bill.id, ctx)).document;
    expect(doc.exchangeRateSource).toBe(ExchangeRateSource.Manual);
    expect(doc.baseSubtotal).toBe(300_000n);
  });
});

describe("a plan resolved before the transaction races a record that lands first", () => {
  test("update: editing lines on what looks like a draft doesn't null out a rate frozen by a concurrent record", async () => {
    const rates: Record<string, string | null> = { "2026-09-20": "59.1" };
    const repos = inMemoryAdapter();
    let billId = "";
    let sideEffectDone = false;
    let services!: Services;
    const money = buildMoneySettings({
      moneyPolicy: async () => {
        // Fires while `update()` below is planning its (line-item-only) write, which
        // still believes the document is an unrecorded draft. A concurrent process
        // records the SAME bill first, before this pre-transaction plan is applied.
        if (billId !== "" && !sideEffectDone) {
          sideEffectDone = true;
          await services.vendorBills.update(billId, { status: VendorBillStatus.Received } as any, ctx);
        }
        return RECOMMENDED_MONEY_POLICY;
      },
      exchangeRates: {
        baseCurrency: () => "dop",
        resolve: async ({ date }) => rates[date.toISOString().slice(0, 10)] ?? null,
      },
    });
    services = buildServices(repos, undefined, money);
    const vendor = await repos.vendors.create({ organizationId: "org", name: "Fuel Co" });
    const draft = await services.vendorBills.create(
      {
        vendorId: vendor.id,
        issueDate: "2026-09-20",
        currency: "usd",
        status: VendorBillStatus.Draft,
        lineItems: [{ source: { type: "expense", id: "fuel", name: "Fuel" }, quantity: "1", price: "5000", taxIds: [] }],
      } as any,
      ctx,
    );
    billId = draft.id;

    await services.vendorBills.update(
      draft.id,
      {
        lineItems: [{ source: { type: "expense", id: "fuel", name: "Fuel" }, quantity: "2", price: "5000", taxIds: [] }],
      } as any,
      ctx,
    );

    const bill = await services.vendorBills.findById(draft.id, ctx);
    expect(bill.status).toBe(VendorBillStatus.Received);
    expect(bill.document.exchangeRate).toBe("59.1");
    expect(bill.document.baseTotal).not.toBeNull();
    expect(bill.document.baseSubtotal).not.toBeNull();
    // The line edit landed (recomputed under the frozen rate), it didn't just vanish.
    expect(bill.document.total).toBe(10_000n);
    expect(bill.document.baseSubtotal).toBe(591_000n);
  });
});
