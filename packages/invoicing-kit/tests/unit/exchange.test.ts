import { describe, expect, test } from "vitest";
import { ExchangeRateSource } from "../../src/types";
import { buildMoneySettings } from "../../src/lib/money/settings";
import { LEGACY_MONEY_POLICY, RECOMMENDED_MONEY_POLICY } from "../../src/lib/money";
import {
  exchangeRateSchema,
  manualRateBaseCurrency,
  resolveIssueExchange,
} from "../../src/lib/exchange";

const issueDate = new Date("2026-09-25");
const provider = (rate: string | null) =>
  buildMoneySettings({
    moneyPolicy: () => RECOMMENDED_MONEY_POLICY,
    exchangeRates: { baseCurrency: () => "DOP", resolve: async () => rate },
  });

describe("money settings", () => {
  test("defaults to the legacy policy and no provider", async () => {
    const money = buildMoneySettings();
    expect(await money.policyFor("org")).toEqual(LEGACY_MONEY_POLICY);
    expect(money.exchangeRates).toBeNull();
  });

  test("a policy that isn't a valid MoneyPolicy is a config error, never silently computed", async () => {
    const money = buildMoneySettings({ moneyPolicy: () => ({ rounding: "halfUp", taxLevel: "Document" }) as any });
    await expect(money.policyFor("org")).rejects.toThrow(
      'invoicing-kit: moneyPolicy returned an invalid policy: {"rounding":"halfUp","taxLevel":"Document"}',
    );
  });

  test("a valid policy is returned as a plain MoneyPolicy", async () => {
    const money = buildMoneySettings({ moneyPolicy: async () => ({ ...RECOMMENDED_MONEY_POLICY, extra: 1 }) as any });
    expect(await money.policyFor("org")).toStrictEqual({ ...RECOMMENDED_MONEY_POLICY });
  });
});

describe("exchangeRateSchema", () => {
  test("accepts and canonicalizes positive rates", () => {
    expect(exchangeRateSchema.parse("59.34700000")).toBe("59.347");
  });
  test("rejects zero, negatives and more than 8 decimals", () => {
    for (const bad of ["0", "0.00", "-1", "1.123456789", "abc"]) {
      expect(exchangeRateSchema.safeParse(bad).success).toBe(false);
    }
  });
});

describe("resolveIssueExchange", () => {
  const base = { organizationId: "org", issueDate, manualRate: null, referenced: null };

  test("no provider → null (feature off)", async () => {
    expect(await resolveIssueExchange({ ...base, money: buildMoneySettings(), currency: "usd" })).toBeNull();
  });
  test("base currency → identity rate", async () => {
    expect(await resolveIssueExchange({ ...base, money: provider("59"), currency: "dop" })).toEqual({
      baseCurrency: "dop", rate: "1", rateDate: issueDate, source: ExchangeRateSource.Identity,
    });
  });
  test("provider rate, canonicalized", async () => {
    const exchange = await resolveIssueExchange({ ...base, money: provider("59.34700000"), currency: "usd" });
    expect(exchange).toEqual({ baseCurrency: "dop", rate: "59.347", rateDate: issueDate, source: ExchangeRateSource.Provider });
  });
  test("manual rate wins over the provider", async () => {
    const exchange = await resolveIssueExchange({ ...base, money: provider("59"), currency: "usd", manualRate: "60.5" });
    expect(exchange!.source).toBe(ExchangeRateSource.Manual);
    expect(exchange!.rate).toBe("60.5");
  });
  test("referenced rate is inherited", async () => {
    const referenced = { baseCurrency: "dop", rate: "58", rateDate: new Date("2026-09-01"), source: ExchangeRateSource.Provider };
    const exchange = await resolveIssueExchange({ ...base, money: provider("59"), currency: "usd", referenced });
    expect(exchange).toEqual({ ...referenced, source: ExchangeRateSource.Referenced });
  });
  test("no rate → EXCHANGE_RATE_REQUIRED", async () => {
    await expect(resolveIssueExchange({ ...base, money: provider(null), currency: "usd" })).rejects.toThrow(
      /EXCHANGE_RATE_REQUIRED/,
    );
  });
  test("a thrown provider error propagates unchanged", async () => {
    const money = buildMoneySettings({
      exchangeRates: { baseCurrency: () => "dop", resolve: async () => { throw new Error("rate store down"); } },
    });
    await expect(resolveIssueExchange({ ...base, money, currency: "usd" })).rejects.toThrow("rate store down");
  });
  test("a provider rate with more than 8 decimals fails loudly", async () => {
    await expect(resolveIssueExchange({ ...base, money: provider("59.123456789"), currency: "usd" })).rejects.toThrow(RangeError);
  });
  test("a provider rate ≤ 0 is no rate → EXCHANGE_RATE_REQUIRED", async () => {
    for (const rate of ["0", "0.00", "-1"]) {
      await expect(resolveIssueExchange({ ...base, money: provider(rate), currency: "usd" })).rejects.toThrow(
        /EXCHANGE_RATE_REQUIRED/,
      );
    }
  });
  test("a malformed provider rate is a provider contract violation with a clear error", async () => {
    for (const rate of ["abc", "59.123456789", "1e-3", 59.347 as unknown as string]) {
      await expect(resolveIssueExchange({ ...base, money: provider(rate), currency: "usd" })).rejects.toThrow(
        /invoicing-kit: exchangeRates\.resolve returned an invalid rate for usd→dop on 2026-09-25/,
      );
    }
  });
  test("a referenced rate wins over a manual one", async () => {
    const referenced = { baseCurrency: "dop", rate: "58", rateDate: new Date("2026-09-01"), source: ExchangeRateSource.Provider };
    const exchange = await resolveIssueExchange({ ...base, money: provider("59"), currency: "usd", manualRate: "65", referenced });
    expect(exchange).toEqual({ ...referenced, source: ExchangeRateSource.Referenced });
  });
});

describe("the provider's base currency", () => {
  const withBase = (baseCurrency: string) =>
    buildMoneySettings({ exchangeRates: { baseCurrency: () => baseCurrency, resolve: async () => "59" } });

  test("is trimmed and lowercased, so identity still applies", async () => {
    const exchange = await resolveIssueExchange({
      money: withBase(" DOP "), organizationId: "org", currency: "dop", issueDate, manualRate: null, referenced: null,
    });
    expect(exchange).toEqual({ baseCurrency: "dop", rate: "1", rateDate: issueDate, source: ExchangeRateSource.Identity });
    expect(await manualRateBaseCurrency(withBase(" DOP "), "org", "usd")).toBe("dop");
  });

  test("anything but a 3-letter code is a clear error", async () => {
    for (const bad of ["DOLLARS", "", "D0P"]) {
      const message = `invoicing-kit: exchangeRates.baseCurrency returned an invalid currency code: ${JSON.stringify(bad)}`;
      await expect(
        resolveIssueExchange({ money: withBase(bad), organizationId: "org", currency: "usd", issueDate, manualRate: null, referenced: null }),
      ).rejects.toThrow(message);
      await expect(manualRateBaseCurrency(withBase(bad), "org", "usd")).rejects.toThrow(message);
    }
  });
});

describe("manualRateBaseCurrency", () => {
  test("returns the base currency for a foreign document", async () => {
    expect(await manualRateBaseCurrency(provider("59"), "org", "usd")).toBe("dop");
  });
  test("rejects a base-currency document or a missing provider", async () => {
    await expect(manualRateBaseCurrency(provider("59"), "org", "dop")).rejects.toThrow(/EXCHANGE_RATE_NOT_APPLICABLE/);
    await expect(manualRateBaseCurrency(buildMoneySettings(), "org", "usd")).rejects.toThrow(/EXCHANGE_RATE_NOT_APPLICABLE/);
  });
});
