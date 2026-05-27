import type { Repositories } from "./adapters/types";
import type { BetterAuthLike } from "./auth/middleware";

export interface InvoicingKitConfig {
  /** Repository bundle. Use `prismaAdapter(prisma)` or your own implementation. */
  adapter: Repositories;
  /** better-auth instance. Must have the organization plugin enabled. */
  auth: BetterAuthLike;
  /** Mount path for the router. Default: "/api/bills". */
  basePath?: string;
}
