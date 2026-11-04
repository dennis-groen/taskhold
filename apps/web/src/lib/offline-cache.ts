// Keeps the signed-in person's lists, chores and to-dos on the device, together with the changes
// they made that haven't reached the server yet. A tick made in a supermarket without signal is
// then still there, and still sent, after the installed app is closed and opened again.
import {
  persistQueryClientRestore,
  persistQueryClientSubscribe,
  type PersistedClient,
  type Persister,
} from "@tanstack/query-persist-client-core";
import type {
  DehydrateOptions,
  Mutation,
  Query,
  QueryClient,
  UseMutationOptions,
  WithRequired,
} from "@tanstack/react-query";

const STORAGE_KEY = "taskhold:offline-cache";

// Bump when the shape of cached data or of a change's variables changes, so an older copy is
// dropped instead of being shown or sent
const VERSION = "1";

/** After this long without the app being used, a saved copy is dropped instead of restored */
const MAX_AGE = Temporal.Duration.from({ days: 7 });

// Saving is batched, since one tap changes the cache several times. Hiding the app saves at once.
const SAVE_DELAY = Temporal.Duration.from({ milliseconds: 500 });

// Who is signed in and the household's member names, kept with the lists (keepForOffline) so the
// app can open them without a connection
const KEPT = "kept";

// What other members can see too, the person's own to-dos, and what keepForOffline keeps: what the
// app shows on its pages. Nothing else (reminder settings, the invite code) is saved.
const SAVED_AREAS = new Set<unknown>(["shopping", "chores", "todos", KEPT]);

/** Something the app needs to open offline, besides the lists themselves */
export type Kept = "viewer" | "household";

/**
 * A change marked `meta: { idempotent: true }` does the same when the API gets it twice. Only
 * those are saved while their request is on its way, because nobody can tell whether a request
 * the app was closed during reached the server. Others are saved only while they wait for a
 * connection, when they certainly haven't been sent.
 */
export type ChangeMeta = { idempotent?: boolean };

/**
 * Makes a change's options the defaults for its key, so a change saved on the device can run
 * after a restart, before any page has set it up. Every change that can wait for a connection
 * needs this.
 */
export function resumable<TData, TVariables, TOnMutateResult>(
  queryClient: QueryClient,
  options: WithRequired<
    UseMutationOptions<TData, Error, TVariables, TOnMutateResult>,
    "mutationKey"
  >,
): void {
  queryClient.setMutationDefaults<TData, Error, TVariables, TOnMutateResult>(
    options.mutationKey,
    options,
  );
}

export const dehydrateOptions: DehydrateOptions = {
  shouldDehydrateQuery: (query: Query) =>
    query.state.status === "success" && SAVED_AREAS.has(query.queryKey[0]),
  shouldDehydrateMutation: (mutation: Mutation) =>
    mutation.state.status === "pending" &&
    (mutation.state.isPaused || mutation.meta?.idempotent === true),
};

/**
 * Marks every saved change as waiting, so `resumePausedMutations` sends it after a restore. One
 * whose request was on its way when the app closed would otherwise count as running forever.
 */
export function asWaiting(client: PersistedClient): PersistedClient {
  const { mutations } = client.clientState;
  return {
    ...client,
    clientState: {
      ...client.clientState,
      mutations: mutations.map((mutation) => ({
        ...mutation,
        state: { ...mutation.state, isPaused: true },
      })),
    },
  };
}

/** Saves to localStorage, which is synchronous, so a save while the app is being hidden finishes */
function createPersister(): Persister & { flush: () => void } {
  let pending: PersistedClient | null = null;
  let timer: ReturnType<typeof setTimeout> | undefined;

  function flush() {
    clearTimeout(timer);
    timer = undefined;
    if (!pending) return;
    const client = asWaiting(pending);
    pending = null;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(client));
    } catch {
      // Storage full or switched off (some private windows): the app works as before, it just
      // won't keep waiting changes across a restart
    }
  }

  return {
    persistClient(client) {
      pending = client;
      timer ??= setTimeout(flush, SAVE_DELAY.total("milliseconds"));
    },
    restoreClient() {
      const saved = localStorage.getItem(STORAGE_KEY);
      // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- written by flush above; VERSION guards the shape
      return saved === null ? undefined : (JSON.parse(saved) as PersistedClient);
    },
    removeClient() {
      clearTimeout(timer);
      timer = undefined;
      pending = null;
      try {
        localStorage.removeItem(STORAGE_KEY);
      } catch {
        // Nothing was saved if storage is unavailable
      }
    },
    flush,
  };
}

const persister = createPersister();

let current: { userId: string; ready: Promise<void>; stop: () => void } | null = null;

/**
 * Restores what was saved for this person, keeps saving from then on, and sends the changes that
 * were waiting. Called every time the app checks who is signed in; only the first call for a
 * person does anything. Nobody signed in, or someone else, drops the saved copy and the cache, so
 * one person's data and changes never reach the next person to use the device.
 *
 * Resolves once the restore is done, so pages load from the restored cache.
 */
export function openOfflineCache(queryClient: QueryClient, userId: string | null): Promise<void> {
  if (current?.userId === userId) return current.ready;
  if (current) forgetOfflineCache(queryClient);
  if (userId === null) {
    persister.removeClient();
    return Promise.resolve();
  }

  // Kept things have no page to keep them alive in memory; they stay until the cache is cleared.
  // Set before the restore, which builds its queries with these defaults.
  queryClient.setQueryDefaults([KEPT], { gcTime: Infinity });

  // The saved copy is only restored for the person it was saved for
  const buster = `${VERSION}:${userId}`;
  let stopped = false;
  let unsubscribe: (() => void) | undefined;

  const ready = persistQueryClientRestore({
    queryClient,
    persister,
    buster,
    maxAge: MAX_AGE.total("milliseconds"),
  })
    // An unreadable copy has been removed already; start empty
    .catch(() => {})
    .then(() => {
      if (stopped) return;
      unsubscribe = persistQueryClientSubscribe({
        queryClient,
        persister,
        buster,
        dehydrateOptions,
      });
      // Does nothing while offline; React Query sends them when the connection is back
      void queryClient.resumePausedMutations();
    });

  current = {
    userId,
    ready,
    stop: () => {
      stopped = true;
      unsubscribe?.();
    },
  };
  return ready;
}

/**
 * Opens the saved copy without asking the server who is signed in, for when it can't be reached:
 * the copy is for whoever was signed in when it was saved. The next successful check goes through
 * `openOfflineCache`, which drops it if that's someone else or nobody by then.
 *
 * Resolves once the restore is done. Nothing is restored when nothing (or an expired copy) is saved.
 */
export async function openSavedCopy(queryClient: QueryClient): Promise<void> {
  const userId = current?.userId ?? savedFor();
  if (userId) await openOfflineCache(queryClient, userId);
}

/** The person the saved copy belongs to, read from its buster */
function savedFor(): string | null {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved === null) return null;
    const parsed: unknown = JSON.parse(saved);
    const buster =
      typeof parsed === "object" && parsed !== null && "buster" in parsed ? parsed.buster : null;
    const prefix = `${VERSION}:`;
    if (typeof buster !== "string" || !buster.startsWith(prefix)) return null;
    return buster.slice(prefix.length) || null;
  } catch {
    // Unreadable, or storage switched off
    return null;
  }
}

/**
 * Keeps something with the saved copy, for the person it belongs to, so the app can open without a
 * connection. Only for what the signed-in person can see in the app anyway. Call after
 * `openOfflineCache`, so it's saved under the right person.
 */
export function keepForOffline(queryClient: QueryClient, name: Kept, data: unknown): void {
  const queryKey = [KEPT, name];
  // Unchanged on most checks; skipping those saves rewriting the copy on every page change
  if (JSON.stringify(queryClient.getQueryData(queryKey)) === JSON.stringify(data)) return;
  queryClient.setQueryData(queryKey, data);
}

/**
 * What `keepForOffline` kept, as restored from the device or kept since. Its shape is what the
 * caller kept; VERSION guards it across app versions.
 */
export function keptForOffline(queryClient: QueryClient, name: Kept): unknown {
  return queryClient.getQueryData([KEPT, name]);
}

/** Drops the saved copy and everything in memory, including changes still waiting. For signing out. */
export function forgetOfflineCache(queryClient: QueryClient): void {
  current?.stop();
  current = null;
  queryClient.clear();
  persister.removeClient();
}

// Closing the app, or switching away from it, saves straight away instead of after the delay
if (typeof document !== "undefined") {
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") persister.flush();
  });
  window.addEventListener("pagehide", persister.flush);
}
