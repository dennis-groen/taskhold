// Live updates: the API's server-sent events stream (/api/live) says which part of the app another
// member (or another of your devices) just changed, and the app refetches it. While the stream is
// down, pages fall back to polling (see isLive).
import { useEffect, useSyncExternalStore } from "react";

/**
 * What the stream says: refetch one area, or refetch everything because changes may have been
 * missed ("resync", once it's back). "down" says it was lost, so polling should start again.
 */
export type LiveMessage = "shopping" | "chores" | "todos" | "household" | "resync" | "down";

const MESSAGES = new Set<string>(["shopping", "chores", "todos", "household", "resync"]);

// The browser gives up on a stream the server refused (e.g. 401 after the session expired)
const RETRY_AFTER_REFUSAL = Temporal.Duration.from({ seconds: 30 });

let live = false;
const statusListeners = new Set<() => void>();

/** Whether changes arrive by themselves right now. Polling queries skip their interval while true. */
export function isLive(): boolean {
  return live;
}

export function useIsLive(): boolean {
  return useSyncExternalStore(subscribeToStatus, isLive, () => false);
}

/**
 * Keeps a live stream open while mounted and calls `onMessage` for each change. Also calls it with
 * "down" when the stream is lost, so polling queries pick up their interval again, and "resync"
 * when it comes back after being down.
 */
export function useLiveUpdates(onMessage: (message: LiveMessage) => void) {
  useEffect(() => {
    let source: EventSource | null = null;
    let retry: ReturnType<typeof setTimeout> | undefined;
    let connectedBefore = false;

    function connect() {
      source = new EventSource("/api/live");
      source.addEventListener("message", (event: MessageEvent<string>) => {
        if (event.data === "ready") {
          setLive(true);
          // The first connection comes with freshly loaded pages; after that, catch up
          if (connectedBefore) onMessage("resync");
          connectedBefore = true;
        } else if (MESSAGES.has(event.data)) {
          // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- checked against MESSAGES
          onMessage(event.data as LiveMessage);
        }
      });
      source.addEventListener("error", () => {
        if (live) {
          setLive(false);
          // Usually the connection itself is gone (a phone waking up, a train tunnel), so this is
          // no time to reload anything that can't fail quietly
          onMessage("down");
        }
        // Reconnecting is the browser's job, unless it gave up
        if (source?.readyState === EventSource.CLOSED) {
          retry = setTimeout(connect, RETRY_AFTER_REFUSAL.total("milliseconds"));
        }
      });
    }

    connect();
    return () => {
      clearTimeout(retry);
      source?.close();
      setLive(false);
    };
  }, [onMessage]);
}

function setLive(next: boolean) {
  if (live === next) return;
  live = next;
  for (const listener of statusListeners) listener();
}

function subscribeToStatus(listener: () => void) {
  statusListeners.add(listener);
  return () => statusListeners.delete(listener);
}
