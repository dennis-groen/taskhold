import { QueryClient, dehydrate } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// React Query keeps everything forever on a server, which Node looks like without a window. The app
// runs in a browser, where unused queries are dropped after a while.
vi.hoisted(() => {
  Object.assign(globalThis, { window: globalThis });
});

const STORAGE_KEY = "taskhold:offline-cache";

/** localStorage as a browser has it, for Node */
function memoryStorage(): Storage {
  const items = new Map<string, string>();
  return {
    get length() {
      return items.size;
    },
    clear: () => items.clear(),
    getItem: (key) => items.get(key) ?? null,
    key: (index) => [...items.keys()][index] ?? null,
    removeItem: (key) => void items.delete(key),
    setItem: (key, value) => void items.set(key, value),
  };
}

/** The module as a freshly opened app loads it, with nothing restored yet */
async function openApp() {
  vi.resetModules();
  const offlineCache = await import("./offline-cache.ts");
  return { ...offlineCache, queryClient: new QueryClient() };
}

const viewer = { user: { id: "sam", name: "Sam" }, household: { id: "home", name: "Home" } };
const lists = [{ id: "groceries", name: "Groceries" }];

/** Uses the app while online as Sam, then closes it with everything saved */
async function useOnlineAsSam() {
  const app = await openApp();
  await app.openOfflineCache(app.queryClient, "sam");
  app.keepForOffline(app.queryClient, "viewer", viewer);
  app.queryClient.setQueryData(["shopping", "lists"], lists);
  // Saving waits a moment after the last change
  await vi.advanceTimersByTimeAsync(1_000);
  return app;
}

/** What the app does on `window` events, recorded so tests can fire them */
const windowListeners = new Map<string, EventListener>();
const reload = vi.fn();

beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal("localStorage", memoryStorage());
  windowListeners.clear();
  vi.stubGlobal("addEventListener", (type: string, listener: EventListener) => {
    windowListeners.set(type, listener);
  });
  reload.mockClear();
  vi.stubGlobal("location", { reload });
});

/** Another tab of the app changing the saved copy, as this tab hears of it */
function otherTabStores(newValue: string | null) {
  if (newValue === null) localStorage.removeItem(STORAGE_KEY);
  else localStorage.setItem(STORAGE_KEY, newValue);
  const listener = windowListeners.get("storage");
  if (!listener) throw new Error("The app doesn't follow other tabs");
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- the fields the app reads
  listener({ key: STORAGE_KEY, newValue } as unknown as StorageEvent);
}

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("opening the app without a connection", () => {
  it("brings back the lists and who they belong to, without asking the server", async () => {
    await useOnlineAsSam();

    const app = await openApp();
    await app.openSavedCopy(app.queryClient);

    expect(app.keptForOffline(app.queryClient, "viewer")).toEqual(viewer);
    expect(app.queryClient.getQueryData(["shopping", "lists"])).toEqual(lists);
  });

  it("keeps what was restored when the check comes back as the same person", async () => {
    await useOnlineAsSam();
    const app = await openApp();
    await app.openSavedCopy(app.queryClient);

    await app.openOfflineCache(app.queryClient, "sam");

    expect(app.queryClient.getQueryData(["shopping", "lists"])).toEqual(lists);
    expect(localStorage.getItem(STORAGE_KEY)).not.toBeNull();
  });

  it.each([
    ["someone else", "bo"],
    ["nobody", null],
  ])("drops the copy when the check comes back as %s", async (_, userId) => {
    await useOnlineAsSam();
    const app = await openApp();
    await app.openSavedCopy(app.queryClient);

    await app.openOfflineCache(app.queryClient, userId);

    expect(app.keptForOffline(app.queryClient, "viewer")).toBeUndefined();
    expect(app.queryClient.getQueryData(["shopping", "lists"])).toBeUndefined();
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
  });

  it("restores nothing after signing out", async () => {
    const online = await useOnlineAsSam();
    online.forgetOfflineCache(online.queryClient);

    const app = await openApp();
    await app.openSavedCopy(app.queryClient);

    expect(app.keptForOffline(app.queryClient, "viewer")).toBeUndefined();
    expect(app.queryClient.getQueryCache().getAll()).toEqual([]);
  });

  it("restores nothing from a copy saved more than a week ago", async () => {
    await useOnlineAsSam();
    vi.setSystemTime(Date.now() + 8 * 24 * 60 * 60 * 1_000);

    const app = await openApp();
    await app.openSavedCopy(app.queryClient);

    expect(app.keptForOffline(app.queryClient, "viewer")).toBeUndefined();
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
  });

  it("ignores a copy saved by an older version of the app", async () => {
    await useOnlineAsSam();
    const saved = localStorage.getItem(STORAGE_KEY) ?? "";
    expect(saved).toContain('"buster":"1:sam"');
    localStorage.setItem(STORAGE_KEY, saved.replace('"buster":"1:sam"', '"buster":"0:sam"'));

    const app = await openApp();
    await app.openSavedCopy(app.queryClient);

    expect(app.queryClient.getQueryCache().getAll()).toEqual([]);
  });

  it("keeps what it was given while the app stays open, without a page using it", async () => {
    const app = await useOnlineAsSam();

    await vi.advanceTimersByTimeAsync(2 * 24 * 60 * 60 * 1_000);

    expect(app.keptForOffline(app.queryClient, "viewer")).toEqual(viewer);
  });
});

describe("what's kept on the device", () => {
  it("keeps only lists, chores and to-dos", async () => {
    const { queryClient, dehydrateOptions } = await openApp();
    queryClient.setQueryData(["shopping", "list", "groceries"], { id: "groceries", items: [] });
    queryClient.setQueryData(["reminders", "status"], { enabled: true });

    const { queries } = dehydrate(queryClient, dehydrateOptions);
    expect(queries.map((query) => query.queryKey)).toEqual([["shopping", "list", "groceries"]]);
  });
});

describe("another tab of the app", () => {
  it.each([
    ["signs out", null],
    ["signs in as someone else", JSON.stringify({ buster: "1:bo", timestamp: 0 })],
  ])("when it %s, stops this tab saving the last person's data", async (_, newValue) => {
    const app = await useOnlineAsSam();
    // A change that is still waiting to be saved when the other tab signs out
    app.queryClient.setQueryData(["shopping", "lists"], [...lists, { id: "diy", name: "DIY" }]);

    otherTabStores(newValue);
    app.queryClient.setQueryData(["todos"], ["Private thing"]);
    await vi.advanceTimersByTimeAsync(1_000);
    windowListeners.get("pagehide")?.(new Event("pagehide"));

    expect(localStorage.getItem(STORAGE_KEY)).toBe(newValue);
    expect(app.queryClient.getQueryData(["shopping", "lists"])).toBeUndefined();
    expect(reload).toHaveBeenCalledOnce();
  });

  it("leaves this tab alone when it saves for the same person", async () => {
    const app = await useOnlineAsSam();
    const other = JSON.stringify({ buster: "1:sam", timestamp: Date.now(), clientState: {} });

    otherTabStores(other);

    expect(app.queryClient.getQueryData(["shopping", "lists"])).toEqual(lists);
    expect(reload).not.toHaveBeenCalled();
  });
});
