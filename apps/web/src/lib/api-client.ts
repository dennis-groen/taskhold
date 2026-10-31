import { DetailedError, hcWithType, parseResponse, type ApiErrorBody } from "@taskhold/api/client";

// Typed Hono RPC client. Same origin as the app: Vite proxies /api to the API in dev.
export const api = hcWithType("/").api;

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
