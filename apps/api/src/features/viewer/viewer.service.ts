// Who is using the app right now: composes the auth and households features through their services.
import { transaction } from "../../db/db.ts";
import { announce } from "../../lib/live-changes.ts";
import { annotate } from "../../lib/wide-event.ts";
import { deleteUser, getSession } from "../auth/auth.service.ts";
import { findMembership, leaveAnyHousehold } from "../households/households.service.ts";

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

/**
 * Deletes the person's account and everything that was only theirs. Their household carries on
 * as if they left: the earliest member becomes owner, or it's deleted if they were the last one.
 */
export async function deleteAccount(userId: string): Promise<void> {
  await transaction(async (tx) => {
    await leaveAnyHousehold(userId, tx);
    await deleteUser(userId, tx);
    // Closes the person's live streams on every device
    await announce({ userId, topic: "account" }, tx);
  });
  annotate("account", { deleted: true });
}
