import type { ErrorHandler } from "hono";
import { HTTPException } from "hono/http-exception";
import type { ContentfulStatusCode } from "hono/utils/http-status";

/** Body of every error response */
export type ApiErrorBody = { error: { code: string; message: string } };

/** An error the client can act on: `code` is stable, `message` is shown to people. */
export class ApiError extends HTTPException {
  readonly code: string;

  constructor(status: ContentfulStatusCode, code: string, message: string) {
    super(status, { message });
    this.code = code;
  }
}

export const onError: ErrorHandler = (err, c) => {
  if (err instanceof ApiError) {
    return c.json({ error: { code: err.code, message: err.message } }, err.status);
  }
  if (err instanceof HTTPException) {
    return c.json({ error: { code: "HTTP_ERROR", message: err.message } }, err.status);
  }
  console.error(err);
  return c.json({ error: { code: "INTERNAL_ERROR", message: "Something went wrong." } }, 500);
};

/** True when a Postgres unique constraint rejected the write (Drizzle wraps the pg error in `cause`). */
export function isUniqueViolation(err: unknown, constraint: string): boolean {
  const pgError: unknown = err instanceof Error && err.cause ? err.cause : err;
  return (
    typeof pgError === "object" &&
    pgError !== null &&
    "code" in pgError &&
    pgError.code === "23505" &&
    "constraint" in pgError &&
    pgError.constraint === constraint
  );
}
