import { api, parseResponse, type InferResponseType } from "@/lib/api-client.ts";

/** Who is signed in (if anyone) and which household they belong to */
export type Viewer = InferResponseType<typeof api.viewer.$get, 200>;

/** The API couldn't say who is signed in: the device is offline, or the server is down */
export class ViewerUnavailableError extends Error {
  constructor(options?: ErrorOptions) {
    super("Couldn't reach taskhold.", options);
    this.name = "ViewerUnavailableError";
  }
}

/**
 * Throws ViewerUnavailableError when the API can't be reached, so the app shows that instead of
 * sending a signed-in person to the sign-in page. Protected pages stay closed either way.
 */
export function fetchViewer(): Promise<Viewer> {
  return parseResponse(api.viewer.$get()).catch((error: unknown) => {
    throw new ViewerUnavailableError({ cause: error });
  });
}

/** Deletes the signed-in person's account; the API also clears the session cookie */
export async function deleteAccount(): Promise<void> {
  await parseResponse(api.viewer.$delete());
}
