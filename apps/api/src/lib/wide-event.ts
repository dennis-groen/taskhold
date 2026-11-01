// One wide event per request (a "canonical log line"): instead of many small log lines, each
// request builds up a single record of everything worth knowing about it, and the request logger
// writes it once when the response is ready. Code anywhere in the request adds to it with
// annotate(); outside a request every function here does nothing.
import { AsyncLocalStorage } from "node:async_hooks";

import { DrizzleQueryError } from "drizzle-orm/errors";
import { HTTPException } from "hono/http-exception";

import { AppError } from "./errors.ts";

/** Fields are grouped by what they describe: http, user, household, shopping, ... */
export type WideEvent = {
  request_id: string;
  db: { queries: number };
  error?: ErrorDescription;
  /** Set by keepEvent(): log this request even when sampling would drop it */
  keep?: boolean;
  [group: string]: unknown;
};

export type ErrorDescription = {
  type: string;
  message: string;
  kind?: string;
  code?: string;
  stack?: string;
  cause?: ErrorDescription;
  [detail: string]: unknown;
};

const storage = new AsyncLocalStorage<WideEvent>();

export function startEvent<T>(requestId: string, work: (event: WideEvent) => Promise<T>) {
  const event: WideEvent = { request_id: requestId, db: { queries: 0 } };
  return storage.run(event, () => work(event));
}

/** The event of the request this code runs in, if any */
export function currentEvent(): WideEvent | undefined {
  return storage.getStore();
}

/** Adds fields to a group of the current request's event, keeping fields added earlier */
export function annotate(group: string, fields: Record<string, unknown>): void {
  const event = storage.getStore();
  if (!event) return;
  const existing = event[group];
  event[group] =
    typeof existing === "object" && existing !== null ? { ...existing, ...fields } : fields;
}

/** Makes sure the current request is logged, e.g. because something went wrong that the status hides */
export function keepEvent(): void {
  const event = storage.getStore();
  if (event) event.keep = true;
}

/** Appends to a list in a group of the current request's event, e.g. every log line of a library */
export function appendToEvent(group: string, list: string, item: unknown): boolean {
  const event = storage.getStore();
  if (!event) return false;
  const fields = event[group];
  const existing = typeof fields === "object" && fields !== null ? Reflect.get(fields, list) : [];
  annotate(group, { [list]: [...(Array.isArray(existing) ? existing : []), item] });
  return true;
}

/** Records the error that decided the response. Only the last one is kept. */
export function recordError(err: unknown): void {
  const event = storage.getStore();
  if (event) event.error = describeError(err);
}

export function countQuery(): void {
  const event = storage.getStore();
  if (event) event.db.queries++;
}

/**
 * A loggable summary of any thrown value. Leaves out what can carry user data or secrets: query
 * parameters (Drizzle puts them in its error message), Postgres `detail` (it quotes the
 * conflicting values) and the message line at the top of the stack.
 */
export function describeError(err: unknown): ErrorDescription {
  if (err instanceof AppError) {
    return { type: "AppError", kind: err.kind, code: err.code, message: err.message };
  }
  if (err instanceof HTTPException) {
    return { type: "HTTPException", message: err.message, status: err.status };
  }
  if (err instanceof DrizzleQueryError) {
    return {
      type: "DrizzleQueryError",
      message: "Database query failed",
      query: err.query,
      stack: stackFrames(err),
      ...(err.cause !== undefined && { cause: describeError(err.cause) }),
    };
  }
  if (err instanceof Error) {
    return {
      type: err.constructor.name || err.name,
      message: err.message,
      ...errorCodeFields(err),
      stack: stackFrames(err),
      ...(err.cause !== undefined && { cause: describeError(err.cause) }),
    };
  }
  return { type: typeof err, message: String(err) };
}

function stackFrames(err: Error): string | undefined {
  const frames = err.stack
    ?.split("\n")
    .filter((line) => line.trimStart().startsWith("at "))
    .join("\n");
  return frames || undefined;
}

// System errors carry a code (ECONNREFUSED); Postgres errors a SQLSTATE and the names of what they hit
function errorCodeFields(err: Error): Record<string, unknown> {
  const fields: Record<string, unknown> = {};
  for (const key of ["code", "severity", "table", "column", "constraint", "routine"]) {
    const value: unknown = Reflect.get(err, key);
    if (typeof value === "string") fields[key] = value;
  }
  return fields;
}
