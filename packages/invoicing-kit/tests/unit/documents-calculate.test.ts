import { describe, expect, test } from "vitest";
import { Hono } from "hono";
import { createInvoicingKit, RECOMMENDED_MONEY_POLICY } from "../../src";
import { inMemoryAdapter } from "../../src/adapters/memory";
import { buildServices } from "../../src/services";
import { buildMoneySettings } from "../../src/lib/money/settings";
import type { AuthContext } from "../../src/auth/types";

function app(rate: string | null) {
  const adapter = inMemoryAdapter();
  const kit = createInvoicingKit({
    adapter,
    auth: { api: { getSession: async () => ({ user: { id: "u" }, session: { activeOrganizationId: "org" } }) } },
    basePath: "/api/bills",
    moneyPolicy: () => RECOMMENDED_MONEY_POLICY,
    exchangeRates: { baseCurrency: () => "dop", resolve: async () => rate },
  });
  const hono = new Hono();
  hono.route("/", kit.router);
  return { hono, adapter };
}

describe("POST /documents/calculate", () => {
  test("previews totals and base amounts with the provider rate", async () => {
    const { hono, adapter } = app("59.347");
    const tax = await adapter.taxes.create({ organizationId: "org", name: "ITBIS", type: "PERCENTAGE", rate: "0.18" });
    const res = await hono.request("/api/bills/documents/calculate", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ currency: "USD", issueDate: "2026-09-25", lineItems: [{ quantity: "1", price: "100000", taxIds: [tax.id] }] }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.total).toBe("118000");
    expect(body.exchange).toEqual({ baseCurrency: "dop", rate: "59.347", rateDate: "2026-09-25", source: "provider" });
    expect(body.base).toEqual({ subtotal: "5934700", tax: "1068246", total: "7002946" });
  });

  test("no rate for the date → base is null, never an error", async () => {
    const { hono } = app(null);
    const res = await hono.request("/api/bills/documents/calculate", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ currency: "usd", issueDate: "2026-09-25", lineItems: [{ quantity: "1.5", price: "333", taxIds: [] }] }),
    });
    const body = await res.json();
    expect(body.subtotal).toBe("500");
    expect(body.exchange).toBeNull();
    expect(body.base).toBeNull();
  });

  test("a manual rate on a base-currency document is rejected, not silently downgraded to identity", async () => {
    const { hono } = app(null);
    const res = await hono.request("/api/bills/documents/calculate", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        currency: "dop",
        issueDate: "2026-09-25",
        exchangeRate: "1.05",
        lineItems: [{ quantity: "1", price: "1000", taxIds: [] }],
      }),
    });
    expect(res.status).toBe(422);
    expect(await res.text()).toContain("EXCHANGE_RATE_NOT_APPLICABLE");
  });

  test("a manual rate for a foreign-currency document previews as source \"manual\" at that rate", async () => {
    const { hono, adapter } = app(null);
    const tax = await adapter.taxes.create({ organizationId: "org", name: "ITBIS", type: "PERCENTAGE", rate: "0.18" });
    const res = await hono.request("/api/bills/documents/calculate", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        currency: "USD",
        issueDate: "2026-09-25",
        exchangeRate: "60",
        lineItems: [{ quantity: "1", price: "100000", taxIds: [tax.id] }],
      }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.exchange).toEqual({ baseCurrency: "dop", rate: "60", rateDate: "2026-09-25", source: "manual" });
    // hand-derived: subtotal 100000 * 60 = 6,000,000; document-level 18% tax = round(6,000,000 * 0.18) = 1,080,000.
    expect(body.base).toEqual({ subtotal: "6000000", tax: "1080000", total: "7080000" });
  });
});

describe("the preview validates the provider's answer like the write path", () => {
  const ctx: AuthContext = { userId: "u", organizationId: "org", role: null };
  const preview = (rate: unknown, baseCurrency = "dop") =>
    buildServices(
      inMemoryAdapter(),
      undefined,
      buildMoneySettings({
        moneyPolicy: () => RECOMMENDED_MONEY_POLICY,
        exchangeRates: { baseCurrency: () => baseCurrency, resolve: async () => rate as string | null },
      }),
    ).documents.calculate(
      { currency: "usd", issueDate: "2026-09-25", lineItems: [{ quantity: "1", price: "100000", taxIds: [] }] },
      ctx,
    );

  test("a rate ≤ 0 is no rate: base is null, never an error", async () => {
    for (const rate of ["0", "0.00", "-1"]) {
      const result = await preview(rate);
      expect(result.exchange).toBeNull();
      expect(result.base).toBeNull();
    }
  });

  test("a malformed rate or one with more than 8 decimals is the same clear error as at issue", async () => {
    for (const rate of ["abc", "59.123456789"]) {
      await expect(preview(rate)).rejects.toThrow(
        /invoicing-kit: exchangeRates\.resolve returned an invalid rate for usd→dop on 2026-09-25/,
      );
    }
  });

  test("the provider's base currency is validated and trimmed", async () => {
    expect((await preview("59.347", " DOP ")).exchange?.baseCurrency).toBe("dop");
    await expect(preview("59.347", "DOLLARS")).rejects.toThrow(/exchangeRates\.baseCurrency returned an invalid currency code/);
  });
});
