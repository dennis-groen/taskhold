import type { ErrorHandler } from "hono";
import { HTTPException } from "hono/http-exception";
import type { ContentfulStatusCode } from "hono/utils/http-status";

import { AppError, type ApiErrorBody, type ErrorKind } from "./errors.ts";
import { recordError } from "./wide-event.ts";

const statusByKind = {
  bad_request: 400,
  unauthorized: 401,
  forbidden: 403,
  not_found: 404,
  conflict: 409,
  too_many_requests: 429,
  unavailable: 503,
} as const satisfies Record<ErrorKind, ContentfulStatusCode>;

/** Turns any thrown error into a JSON error response */
export const errorHandler: ErrorHandler = (err, c) => {
  // The request's wide event carries the error, stack included for unexpected ones
  recordError(err);

  if (err instanceof AppError) {
    return c.json<ApiErrorBody>(
      { error: { code: err.code, message: err.message } },
      statusByKind[err.kind],
    );
  }
  // Raised by Hono itself, e.g. a malformed JSON body
  if (err instanceof HTTPException) {
    return c.json<ApiErrorBody>(
      { error: { code: "HTTP_ERROR", message: err.message } },
      err.status,
    );
  }

  return c.json<ApiErrorBody>(
    { error: { code: "INTERNAL_ERROR", message: "Something went wrong." } },
    500,
  );
};
