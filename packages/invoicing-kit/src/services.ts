import type { Repositories } from "./adapters/types";
import { ClientService } from "./domains/clients/service";

export interface Services {
  clients: ClientService;
}

export function buildServices(repos: Repositories): Services {
  return {
    clients: new ClientService(repos),
  };
}
