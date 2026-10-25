// Who is using the app right now: composes the auth and households features through their services.
import { getSession } from "../auth/auth.service.ts";
import { findMembership } from "../households/households.service.ts";

export async function getViewer(headers: Headers) {
  const session = await getSession(headers);
  if (!session) {
    return { user: null, household: null };
  }

  const { id, name, email, image } = session.user;
  return {
    user: { id, name, email, image: image ?? null },
    household: await findMembership(id),
  };
}
