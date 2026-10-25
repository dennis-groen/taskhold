import { auth, type Session } from "./auth.ts";

/** The session behind a request's cookies, or null when nobody is signed in */
export function getSession(headers: Headers): Promise<Session | null> {
  return auth.api.getSession({ headers });
}
