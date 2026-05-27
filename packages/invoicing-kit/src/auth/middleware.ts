import { createMiddleware } from "hono/factory";
import { httpError, ErrorCode } from "../lib/errors";
import type { AuthVariables } from "./types";

// `Auth` is the runtime shape we need from better-auth. We rely on the consumer
// to pass a real better-auth instance; the type below is a structural minimum
// so we don't bind to better-auth's full type surface (which churns across
// versions).
export interface BetterAuthLike {
  api: {
    getSession: (args: {
      headers: Headers;
    }) => Promise<{
      user: { id: string; role?: string | null };
      session: { activeOrganizationId?: string | null };
    } | null>;
  };
}

export function authMiddleware(auth: BetterAuthLike) {
  return createMiddleware<{ Variables: AuthVariables }>(async (c, next) => {
    const session = await auth.api.getSession({ headers: c.req.raw.headers });
    if (!session) {
      throw httpError({
        code: ErrorCode.Unauthorized,
        status: 401,
        message: "Authentication required",
      });
    }
    if (!session.session.activeOrganizationId) {
      throw httpError({
        code: ErrorCode.NoActiveOrganization,
        status: 400,
        message: "No active organization on the session",
      });
    }
    c.set("authContext", {
      userId: session.user.id,
      organizationId: session.session.activeOrganizationId,
      role: session.user.role ?? null,
    });
    await next();
  });
}
