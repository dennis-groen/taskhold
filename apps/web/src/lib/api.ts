import { DetailedError, hcWithType, parseResponse, type ApiErrorBody } from "@taskhold/api/client";

// Typed Hono RPC client. Same origin as the app: Vite proxies /api to the API in dev.
export const api = hcWithType("/").api;

/**
 * Encodes a value for an RPC path parameter. The client inserts params as-is, so a "?", "#" or
 * "/" in one (e.g. from a crafted URL) would end or change the request path: "/lists/<id>?"
 * plus "/items/<item>" becomes a request to the list itself.
 */
export function pathParam(value: string): string {
  return encodeURIComponent(value);
}

/** Resolves to the success body, throws DetailedError for any non-2xx response */
export { parseResponse };
export type { InferResponseType } from "@taskhold/api/client";

function isApiErrorBody(value: unknown): value is ApiErrorBody {
  return (
    typeof value === "object" &&
    value !== null &&
    "error" in value &&
    typeof value.error === "object" &&
    value.error !== null &&
    "code" in value.error &&
    typeof value.error.code === "string" &&
    "message" in value.error &&
    typeof value.error.message === "string"
  );
}

function errorBody(error: unknown): ApiErrorBody | null {
  if (!(error instanceof DetailedError)) return null;
  // parseResponse puts the parsed error body in detail.data
  const detail: unknown = error.detail;
  const body =
    typeof detail === "object" && detail !== null && "data" in detail ? detail.data : null;
  return isApiErrorBody(body) ? body : null;
}

/** The API's error code, e.g. "LIST_NOT_FOUND", or null for network errors and the like */
export function errorCode(error: unknown): string | null {
  return errorBody(error)?.error.code ?? null;
}

/** The message the API wrote for people, or `fallback` when there isn't one (e.g. network down) */
export function errorMessage(error: unknown, fallback: string): string {
  return errorBody(error)?.error.message ?? fallback;
}

// What a proxy in front of the API answers while the API itself is down or restarting
const PROXY_SAYS_DOWN = new Set([502, 503, 504]);

/**
 * True when the API itself never answered: the request got no response at all (fetch throws a
 * TypeError), or a proxy in front answered that it's down. The API turning a request down is
 * not this.
 */
export function isUnreachable(error: unknown): boolean {
  if (error instanceof DetailedError) return PROXY_SAYS_DOWN.has(error.statusCode ?? 0);
  return error instanceof TypeError;
}
