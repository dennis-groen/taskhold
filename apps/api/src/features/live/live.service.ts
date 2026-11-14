// Live updates: which announced changes each signed-in person's stream hears about.
// Their household's changes, and their own (to-dos, joining or leaving, account deletion).
import { watch, type FeedEvent, type Topic } from "../../lib/live-changes.ts";
import { findMembership } from "../households/households.service.ts";

/** What a stream tells the app: refetch a topic, or refetch everything after missed changes */
export type LiveMessage = Topic | "resync";

/**
 * Starts passing the person's changes to `send`, and calls `close` when the stream should end
 * (account deleted, server shutting down). Returns the function that stops it.
 */
export async function followChanges(
  userId: string,
  { send, close }: { send: (message: LiveMessage) => void; close: () => void },
): Promise<() => void> {
  let householdId: string | null = null;
  const refreshMembership = async () => {
    householdId = (await findMembership(userId))?.id ?? null;
  };

  // Events are handled one after another, so a household change that arrives while membership is
  // being looked up is checked against the result
  let queue = Promise.resolve();
  const handle = (event: FeedEvent) => {
    queue = queue.then(() => route(event)).catch(close);
  };

  async function route(event: FeedEvent) {
    if (event.type === "close") return close();
    if (event.type === "resync") {
      await refreshMembership();
      return send("resync");
    }
    const { change } = event;
    if ("householdId" in change) {
      if (change.householdId === householdId) send(change.topic);
      return;
    }
    if (change.userId !== userId) return;
    if (change.topic === "account") return close();
    // They joined or left a household: follow them to the new one (or to none)
    if (change.topic === "household") await refreshMembership();
    send(change.topic);
  }

  // Listening starts before membership is read, so a join in between isn't missed
  const stop = await watch(handle);
  try {
    queue = queue.then(refreshMembership);
    await queue;
  } catch (err) {
    // The stream never starts, so nothing else would stop the listener
    stop();
    throw err;
  }
  return stop;
}
