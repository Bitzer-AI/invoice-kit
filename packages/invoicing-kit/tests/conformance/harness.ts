import { afterEach, beforeEach, describe } from "vitest";
import type { Repositories } from "../../src/adapters/types";
import type { AdapterFactory } from "./factories";

export interface SuiteContext {
  repos: Repositories;
}

export function describeForEachAdapter(
  name: string,
  factories: AdapterFactory[],
  body: (ctx: SuiteContext) => void,
): void {
  for (const factory of factories) {
    describe(`${name} [${factory.name}]`, () => {
      const ctx: SuiteContext = { repos: undefined as unknown as Repositories };

      beforeEach(async () => {
        ctx.repos = await factory.create();
      });

      afterEach(async () => {
        await factory.reset(ctx.repos);
      });

      body(ctx);
    });
  }
}
