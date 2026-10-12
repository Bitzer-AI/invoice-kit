import type { BetterAuthLike } from "../../src/auth/middleware";

export interface StubSession {
  user: { id: string; role?: string | null };
  session: { activeOrganizationId?: string | null };
}

export function stubAuth(session: StubSession | null): BetterAuthLike {
  return {
    api: {
      async getSession() {
        return session;
      },
    },
  };
}
