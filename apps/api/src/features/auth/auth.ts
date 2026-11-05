import { drizzleAdapter } from "@better-auth/drizzle-adapter/relations-v2";
import { betterAuth } from "better-auth";

import { env } from "../../env.ts";
import { db } from "../../db/db.ts";
import * as schema from "../../db/schema.ts";
import { logger } from "../../lib/logger.ts";
import { appendToEvent, describeError, keepEvent } from "../../lib/wide-event.ts";

// Better Auth endpoints the app doesn't use. Each one is surface someone could call directly,
// e.g. /update-user would let anyone replace their Google name and avatar with arbitrary values
// that other members then load. Re-enable one here when a feature needs it.
const UNUSED_ENDPOINTS = [
  "/account-info",
  "/change-email",
  "/change-password",
  "/delete-user",
  "/delete-user/callback",
  "/get-access-token",
  "/link-social",
  "/list-accounts",
  "/list-sessions",
  "/refresh-token",
  "/request-password-reset",
  "/reset-password",
  "/revoke-other-sessions",
  "/revoke-session",
  "/revoke-sessions",
  "/send-verification-email",
  "/sign-in/email",
  "/sign-up/email",
  "/unlink-account",
  "/update-session",
  "/update-user",
  "/verify-email",
  "/verify-password",
];

const authLogger = logger.child({ component: "better-auth" });

export const auth = betterAuth({
  baseURL: env.BETTER_AUTH_URL,
  secret: env.BETTER_AUTH_SECRET,
  database: drizzleAdapter(db, { provider: "pg", schema }),
  socialProviders: {
    google: {
      clientId: env.GOOGLE_CLIENT_ID,
      clientSecret: env.GOOGLE_CLIENT_SECRET,
    },
  },
  disabledPaths: UNUSED_ENDPOINTS,
  // On regardless of NODE_ENV (Better Auth's default is production only). Requests are keyed by
  // the client IP that auth.routes.ts puts in X-Forwarded-For.
  rateLimit: { enabled: env.NODE_ENV !== "test" },
  advanced: {
    ipAddress: { trustedProxies: env.TRUSTED_PROXIES },
  },
  // During a request its messages go on the request's wide event (auth.logs), otherwise on a line
  // of their own. Only errors among the extra arguments are kept: others can be provider
  // responses with tokens in them.
  logger: {
    level: "info",
    log: (level, message, ...args) => {
      const errors = args.filter((arg) => arg instanceof Error).map(describeError);
      const entry = { level, message, ...(errors.length > 0 && { errors }) };
      // A failed OAuth callback still answers with a redirect, so its status looks fine
      if (level === "warn" || level === "error") keepEvent();
      if (!appendToEvent("auth", "logs", entry)) authLogger[level](entry, message);
    },
  },
});

export type Session = typeof auth.$Infer.Session;
