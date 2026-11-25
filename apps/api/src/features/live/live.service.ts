// Live updates: which announced changes each signed-in person's stream hears about.
// Their household's changes, and their own (to-dos, joining or leaving, account deletion).
import { annotate } from "../../lib/wide-event.ts";
import { watch, type FeedEvent } from "./live-changes.ts";
import { tooManyStreams } from "./live.errors.ts";
import type { Topic } from "./live-topics.ts";
import { findMembership } from "../households/households.service.ts";

// Far above the devices and tabs one person keeps open; keeps one account from tying up the server
export const MAX_STREAMS_PER_USER = 10;

const activeStreams = new Map<string, number>();

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
  // Claim the slot before any await, so a burst of parallel requests can't slip past the cap
  const current = activeStreams.get(userId) ?? 0;
  if (current >= MAX_STREAMS_PER_USER) {
    annotate("live", { active_streams: current });
    throw tooManyStreams();
  }
  const active = current + 1;
  activeStreams.set(userId, active);
  annotate("live", { active_streams: active });

  let released = false;
  const releaseSlot = () => {
    if (released) return;
    released = true;
    const remaining = (activeStreams.get(userId) ?? 1) - 1;
    if (remaining <= 0) activeStreams.delete(userId);
    else activeStreams.set(userId, remaining);
  };

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

  let stopWatch: (() => void) | null = null;
  try {
    // Listening starts before membership is read, so a join in between isn't missed
    stopWatch = await watch(handle);
    queue = queue.then(refreshMembership);
    await queue;
  } catch (err) {
    // The stream never starts, so nothing else would stop the listener or free its slot
    stopWatch?.();
    releaseSlot();
    throw err;
  }

  return () => {
    if (released) return;
    stopWatch();
    releaseSlot();
  };
}
