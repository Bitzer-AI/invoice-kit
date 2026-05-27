import type { Repositories } from "./adapters/types";
import { ClientService } from "./domains/clients/service";
import { ProductService } from "./domains/products/service";
import { TaxService } from "./domains/taxes/service";
import { PaymentMethodService } from "./domains/payment-methods/service";
import { QuoteService } from "./domains/quotes/service";

export interface Services {
  clients: ClientService;
  products: ProductService;
  taxes: TaxService;
  paymentMethods: PaymentMethodService;
  quotes: QuoteService;
}

export function buildServices(repos: Repositories): Services {
  return {
    clients: new ClientService(repos),
    products: new ProductService(repos),
    taxes: new TaxService(repos),
    paymentMethods: new PaymentMethodService(repos),
    quotes: new QuoteService(repos),
  };
}
