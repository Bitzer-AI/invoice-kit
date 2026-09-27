import { beforeEach, describe, expect, test } from "vitest";
import { inMemoryAdapter } from "../../src/adapters/memory";
import { buildServices, type Services } from "../../src/services";
import { buildMoneySettings } from "../../src/lib/money/settings";
import { LEGACY_MONEY_POLICY, RECOMMENDED_MONEY_POLICY } from "../../src/lib/money";
import { VendorBillStatus } from "../../src/types";
import type { MoneyPolicy } from "../../src/types";
import type { AuthContext } from "../../src/auth/types";

let rates: Record<string, string | null>;
const ctx: AuthContext = { userId: "u", organizationId: "org", role: null };

async function seed(services: Services) {
  const vendor = await services.vendors.create({ name: "Fuel Co" }, ctx);
  const body = (overrides: Record<string, unknown> = {}) =>
    ({
      vendorId: vendor.id,
      issueDate: "2026-09-20",
      currency: "usd",
      status: VendorBillStatus.Draft,
      lineItems: [{ source: { type: "expense", id: "fuel", name: "Fuel" }, quantity: "1", price: "5000", taxIds: [] }],
      ...overrides,
    }) as any;
  return { vendor, body };
}

beforeEach(() => {
  rates = { "2026-09-20": "59.1" };
});

describe("a payment that records a draft vendor bill", () => {
  test("a full manual payment on a USD draft freezes the rate, the policy and the base amounts", async () => {
    const repos = inMemoryAdapter();
    const money = buildMoneySettings({
      moneyPolicy: () => RECOMMENDED_MONEY_POLICY,
      exchangeRates: {
        baseCurrency: () => "dop",
        resolve: async ({ date }) => rates[date.toISOString().slice(0, 10)] ?? null,
      },
    });
    const services = buildServices(repos, undefined, money);
    const { body } = await seed(services);
    const draft = await services.vendorBills.create(body(), ctx);
    const draftDoc = (await services.vendorBills.findById(draft.id, ctx)).document;
    expect(draftDoc.total).toBe(5000n);
    expect(draftDoc.moneyPolicy).toBeNull();

    await services.vendorBillPayments.recordManualVendorBillPayment(
      draft.id,
      { amount: "5000", currency: "usd", provider: "manual" } as any,
      ctx,
    );

    const bill = await services.vendorBills.findById(draft.id, ctx);
    expect(bill.status).toBe(VendorBillStatus.Paid);
    expect(bill.document.exchangeRate).toBe("59.1");
    expect(bill.document.moneyPolicy).toEqual(RECOMMENDED_MONEY_POLICY);
    expect(bill.document.baseSubtotal).toBe(295_500n);
    expect(bill.document.baseTotal).toBe(295_500n);
  });

  test("with no rate available, the payment is rejected and nothing is recorded", async () => {
    rates = {};
    const repos = inMemoryAdapter();
    const money = buildMoneySettings({
      moneyPolicy: () => RECOMMENDED_MONEY_POLICY,
      exchangeRates: {
        baseCurrency: () => "dop",
        resolve: async ({ date }) => rates[date.toISOString().slice(0, 10)] ?? null,
      },
    });
    const services = buildServices(repos, undefined, money);
    const { body } = await seed(services);
    const draft = await services.vendorBills.create(body(), ctx);

    await expect(
      services.vendorBillPayments.recordManualVendorBillPayment(
        draft.id,
        { amount: "5000", currency: "usd", provider: "manual" } as any,
        ctx,
      ),
    ).rejects.toThrow(/EXCHANGE_RATE_REQUIRED/);

    const bill = await services.vendorBills.findById(draft.id, ctx);
    expect(bill.status).toBe(VendorBillStatus.Draft);
    expect(bill.document.exchangeRate).toBeNull();
    const payments = await services.vendorBillPayments.listForBill(draft.id, ctx);
    expect(payments.data ?? payments).toHaveLength(0);
  });

  test("without a provider, the payment still works and records the policy (backward compatible)", async () => {
    const repos = inMemoryAdapter();
    const money = buildMoneySettings({ moneyPolicy: () => RECOMMENDED_MONEY_POLICY });
    const services = buildServices(repos, undefined, money);
    const { body } = await seed(services);
    const draft = await services.vendorBills.create(body(), ctx);

    await services.vendorBillPayments.recordManualVendorBillPayment(
      draft.id,
      { amount: "5000", currency: "usd", provider: "manual" } as any,
      ctx,
    );

    const bill = await services.vendorBills.findById(draft.id, ctx);
    expect(bill.status).toBe(VendorBillStatus.Paid);
    expect(bill.document.exchangeRate).toBeNull();
    expect(bill.document.moneyPolicy).toEqual(RECOMMENDED_MONEY_POLICY);
  });
});

describe("the amount check and status decision use the recomputed total, not the pre-recompute one", () => {
  function draftBody(vendorId: string) {
    return {
      vendorId,
      issueDate: "2026-09-20",
      currency: "usd",
      status: VendorBillStatus.Draft,
      // qty 1.5 x price 333, no tax: LEGACY (truncate) totals 499, RECOMMENDED (half-up) totals 500.
      lineItems: [{ source: { type: "expense", id: "fuel", name: "Fuel" }, quantity: "1.5", price: "333", taxIds: [] }],
    } as any;
  }

  test("a policy switch that raises the recomputed total turns a formerly-full payment into a partial one", async () => {
    const repos = inMemoryAdapter();
    let policy: MoneyPolicy = LEGACY_MONEY_POLICY;
    const money = buildMoneySettings({ moneyPolicy: () => policy });
    const services = buildServices(repos, undefined, money);
    const { vendor } = await seed(services);
    const draft = await services.vendorBills.create(draftBody(vendor.id), ctx);
    expect((await services.vendorBills.findById(draft.id, ctx)).document.total).toBe(499n);

    // The org switches its money policy before this (still-draft) bill is ever recorded.
    policy = RECOMMENDED_MONEY_POLICY;
    await services.vendorBillPayments.recordManualVendorBillPayment(
      draft.id,
      { amount: "499", currency: "usd", provider: "manual" } as any,
      ctx,
    );

    const bill = await services.vendorBills.findById(draft.id, ctx);
    expect(bill.document.total).toBe(500n);
    // 499 paid against a recomputed total of 500 is a partial payment, not a full one.
    expect(bill.status).toBe(VendorBillStatus.PartiallyPaid);
  });
});
