import type { Repositories } from "../../src/adapters/types";

export interface AdapterFactory {
  name: string;
  /** Returns a fresh Repositories instance for one test. */
  create(): Promise<Repositories>;
  /** Cleanup invoked after each test. Drops all data. */
  reset(repos: Repositories): Promise<void>;
}

export interface AdapterFactories {
  factories: AdapterFactory[];
}
