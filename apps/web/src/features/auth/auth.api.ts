import { DetailedError } from "@taskhold/api/client";

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

// Waits between attempts. A phone that was just woken up, or the installed app opened from
// the home screen, can take a second or two to get its connection back.
const RETRY_DELAYS_MS = [500, 1_000, 2_000];

/**
 * Throws ViewerUnavailableError when the API can't be reached, so the app shows that (or opens
 * from the copy on the device) instead of sending a signed-in person to the sign-in page.
 * Network failures and server errors are retried a few times first, unless the browser says it's
 * offline: then the app opens from the device straight away, and asks again once it's back.
 */
export async function fetchViewer(): Promise<Viewer> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await parseResponse(api.viewer.$get());
    } catch (error) {
      const delay = RETRY_DELAYS_MS[attempt];
      if (delay === undefined || !isTransient(error) || !navigator.onLine) {
        throw new ViewerUnavailableError({ cause: error });
      }
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }
}

/** No response at all, or the server (or a proxy in front of it) failing */
function isTransient(error: unknown): boolean {
  return !(error instanceof DetailedError) || (error.statusCode ?? 500) >= 500;
}

/** Deletes the signed-in person's account; the API also clears the session cookie */
export async function deleteAccount(): Promise<void> {
  await parseResponse(api.viewer.$delete());
}
