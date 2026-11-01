import { api, parseResponse, type InferResponseType } from "@/lib/api-client.ts";

/** Who is signed in (if anyone) and which household they belong to */
export type Viewer = InferResponseType<typeof api.viewer.$get, 200>;

const SIGNED_OUT: Viewer = { user: null, household: null };

/** Never throws: an unreachable API counts as signed out, so protected pages stay closed */
export function fetchViewer(): Promise<Viewer> {
  return parseResponse(api.viewer.$get()).catch(() => SIGNED_OUT);
}

/** Deletes the signed-in person's account; the API also clears the session cookie */
export async function deleteAccount(): Promise<void> {
  await parseResponse(api.viewer.$delete());
}
