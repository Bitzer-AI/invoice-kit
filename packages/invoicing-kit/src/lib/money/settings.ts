import type { ExchangeRateProvider, InvoicingKitConfig } from "../../config";
import type { MoneyPolicy } from "../../types";
import { LEGACY_MONEY_POLICY, parseMoneyPolicy } from "./policy";

export interface MoneySettings {
  policyFor(organizationId: string): Promise<MoneyPolicy>;
  exchangeRates: ExchangeRateProvider | null;
}

export function buildMoneySettings(
  config: Pick<InvoicingKitConfig, "moneyPolicy" | "exchangeRates"> = {},
): MoneySettings {
  return {
    async policyFor(organizationId) {
      if (!config.moneyPolicy) return LEGACY_MONEY_POLICY;
      const returned: unknown = await config.moneyPolicy({ organizationId });
      const policy = parseMoneyPolicy(returned);
      if (policy === null) {
        throw new Error(`invoicing-kit: moneyPolicy returned an invalid policy: ${JSON.stringify(returned)}`);
      }
      return policy;
    },
    exchangeRates: config.exchangeRates ?? null,
  };
}
