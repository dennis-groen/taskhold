import { logger } from "hono/logger";

// Invite codes are join credentials, and /api/auth query strings carry OAuth codes and state
const SECRETS_IN_URLS: [RegExp, string][] = [
  [/(\/invites\/)[^/?\s]+/g, "$1[redacted]"],
  [/(\/api\/auth\/[^?\s]*)\?\S*/g, "$1?[redacted]"],
];

function redact(line: string): string {
  return SECRETS_IN_URLS.reduce(
    (text, [pattern, replacement]) => text.replace(pattern, replacement),
    line,
  );
}

/** Hono's request logger, with secrets in URLs masked */
export const requestLogger = () =>
  logger((message, ...rest) => console.log(redact(message), ...rest));
