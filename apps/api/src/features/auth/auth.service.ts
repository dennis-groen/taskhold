import { annotate } from "../../lib/wide-event.ts";
import { auth, type Session } from "./auth.ts";

/** The session behind a request's cookies, or null when nobody is signed in */
export async function getSession(headers: Headers): Promise<Session | null> {
  const session = await auth.api.getSession({ headers });
  if (session) annotate("user", { id: session.user.id });
  return session;
}
