import type { Repositories } from "./adapters/types";
import { ClientService } from "./domains/clients/service";
import { ProductService } from "./domains/products/service";
import { TaxService } from "./domains/taxes/service";

export interface Services {
  clients: ClientService;
  products: ProductService;
  taxes: TaxService;
}

export function buildServices(repos: Repositories): Services {
  return {
    clients: new ClientService(repos),
    products: new ProductService(repos),
    taxes: new TaxService(repos),
  };
}
