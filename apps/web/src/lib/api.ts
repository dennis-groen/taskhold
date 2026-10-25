import {
  DetailedError,
  hcWithType,
  parseResponse,
  type ApiErrorBody,
  type InferResponseType,
} from "@taskhold/api/client";

// Same origin as the app: Vite proxies /api to the API in dev
export const api = hcWithType("/").api;

/** Resolves to the success body, throws DetailedError for any non-2xx response */
export { parseResponse };

export type Viewer = InferResponseType<typeof api.viewer.$get, 200>;
export type Household = InferResponseType<typeof api.household.$get, 200>["household"];
export type HouseholdMember = Household["members"][number];
export type InvitePreview = InferResponseType<(typeof api.invites)[":code"]["$get"], 200>["invite"];

function isApiErrorBody(value: unknown): value is ApiErrorBody {
  return (
    typeof value === "object" &&
    value !== null &&
    "error" in value &&
    typeof value.error === "object" &&
    value.error !== null &&
    "message" in value.error &&
    typeof value.error.message === "string"
  );
}

/** The message the API wrote for people, or `fallback` when there isn't one (e.g. network down) */
export function errorMessage(error: unknown, fallback: string): string {
  if (error instanceof DetailedError) {
    // parseResponse puts the parsed error body in detail.data
    const detail: unknown = error.detail;
    const body =
      typeof detail === "object" && detail !== null && "data" in detail ? detail.data : null;
    if (isApiErrorBody(body)) return body.error.message;
  }
  return fallback;
}
