import {
  QueryClient,
  dehydrate,
  hydrate,
  onlineManager,
  queryOptions,
} from "@tanstack/react-query";
import type { PersistedClient } from "@tanstack/query-persist-client-core";
import { DetailedError } from "@taskhold/api/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { changeFailed, offerUndo } from "./feedback.ts";
import { asWaiting, dehydrateOptions } from "./offline-cache.ts";
import {
  defineChange,
  refetchArea,
  refetchEverything,
  registerChanges,
  runChange,
} from "./offline-changes.ts";

vi.mock("./feedback.ts", () => ({ changeFailed: vi.fn(), offerUndo: vi.fn() }));

// A small collection standing in for an area's data: notes in the to-dos area
type Note = { id: string; text: string };
const notesQuery = () =>
  queryOptions({
    queryKey: ["todos", "notes"],
    queryFn: (): Promise<Note[]> => Promise.resolve([]),
  });

const api = vi.hoisted(() => ({
  add: vi.fn<(note: unknown) => Promise<unknown>>(),
  remove: vi.fn<(id: unknown) => Promise<unknown>>(),
  restore: vi.fn<(notes: unknown) => Promise<unknown>>(),
  shout: vi.fn<(id: unknown) => Promise<unknown>>(),
}));

const restore = defineChange("todos", "restore", {
  idempotent: true,
  ordered: true,
  send: (notes: Note[]) => api.restore(notes),
  target: () => notesQuery().queryKey,
  apply: (notes, removed) => [...notes, ...removed],
});

const changes = {
  add: defineChange("todos", "add", {
    idempotent: true,
    send: (note: Note) => api.add(note),
    target: () => notesQuery().queryKey,
    apply: (notes, note) => [...notes, note],
  }),
  remove: defineChange("todos", "remove", {
    idempotent: false,
    ordered: true,
    send: (id: string) => api.remove(id),
    target: () => notesQuery().queryKey,
    apply: (notes, id) => notes.filter((note) => note.id !== id),
    undo: {
      by: restore,
      vars: (id, before) => {
        const removed = before?.filter((note) => note.id === id) ?? [];
        return removed.length > 0 ? removed : null;
      },
    },
  }),
  // Only the API knows the result, as with a chore's next due date
  shout: defineChange("todos", "shout", {
    idempotent: true,
    send: (id: string) => api.shout(id),
    target: () => notesQuery().queryKey,
    settle: (notes, response, id) =>
      notes.map((note) => (note.id === id ? { ...note, text: String(response) } : note)),
    failure: false,
  }),
  restore,
};

const milk: Note = { id: "milk", text: "Buy milk" };
const bread: Note = { id: "bread", text: "Buy bread" };

/** A query client as the app sets one up, before anything is restored into it */
function appClient() {
  const queryClient = new QueryClient();
  registerChanges(queryClient, changes);
  return queryClient;
}

/** The notes as the screen shows them */
function shown(queryClient: QueryClient) {
  return queryClient.getQueryData(notesQuery().queryKey);
}

/** A request that answers when the test says so */
function deferred() {
  const answer = { resolve: (_value: unknown) => {} };
  const promise = new Promise<unknown>((resolve) => {
    answer.resolve = resolve;
  });
  return { promise, resolve: (value: unknown) => answer.resolve(value) };
}

/** What the app writes to the device and reads back after a restart */
function saveAndRestart(queryClient: QueryClient) {
  const saved: PersistedClient = asWaiting({
    buster: "",
    timestamp: Date.now(),
    clientState: dehydrate(queryClient, dehydrateOptions),
  });
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- round trip of what was just written
  const restored = JSON.parse(JSON.stringify(saved)) as PersistedClient;
  const next = appClient();
  hydrate(next, restored.clientState);
  return next;
}

/** Taps Undo on the last notice offered */
function tapUndo() {
  const onUndo = vi.mocked(offerUndo).mock.lastCall?.[1];
  if (!onUndo) throw new Error("No Undo was offered");
  onUndo();
}

beforeEach(() => {
  vi.resetAllMocks();
});

afterEach(() => {
  onlineManager.setOnline(true);
});

describe("a change", () => {
  it("shows straight away and stays once the API has it", async () => {
    const queryClient = appClient();
    queryClient.setQueryData(notesQuery().queryKey, [milk]);
    const request = deferred();
    api.add.mockReturnValue(request.promise);

    const sent = runChange(queryClient, changes.add, bread);
    await vi.waitFor(() => expect(shown(queryClient)).toEqual([milk, bread]));

    request.resolve({});
    await sent;
    expect(api.add).toHaveBeenCalledExactlyOnceWith(bread);
    expect(shown(queryClient)).toEqual([milk, bread]);
  });

  it("is rolled back with a notice when the API turns it down", async () => {
    const queryClient = appClient();
    queryClient.setQueryData(notesQuery().queryKey, [milk]);
    api.remove.mockRejectedValue(new Error("Gone"));

    await expect(runChange(queryClient, changes.remove, "milk")).rejects.toThrow("Gone");

    expect(shown(queryClient)).toEqual([milk]);
    expect(changeFailed).toHaveBeenCalledOnce();
  });

  it("is sent again when the API gives no answer, and stays on screen meanwhile", async () => {
    vi.useFakeTimers();
    try {
      const queryClient = appClient();
      queryClient.setQueryData(notesQuery().queryKey, []);
      api.add.mockRejectedValueOnce(new TypeError("Failed to fetch")).mockResolvedValue({});

      const sent = runChange(queryClient, changes.add, milk);
      await vi.advanceTimersByTimeAsync(0);
      expect(api.add).toHaveBeenCalledTimes(1);
      expect(shown(queryClient)).toEqual([milk]);
      expect(changeFailed).not.toHaveBeenCalled();

      await vi.advanceTimersByTimeAsync(60_000);
      await sent;
      expect(api.add).toHaveBeenCalledTimes(2);
      expect(shown(queryClient)).toEqual([milk]);
    } finally {
      vi.useRealTimers();
    }
  });

  it("isn't sent again on a guess when sending twice could do harm", async () => {
    const queryClient = appClient();
    queryClient.setQueryData(notesQuery().queryKey, [milk]);
    api.remove.mockRejectedValue(new TypeError("Failed to fetch"));

    await expect(runChange(queryClient, changes.remove, "milk")).rejects.toThrow("Failed to fetch");
    expect(api.remove).toHaveBeenCalledTimes(1);
    expect(shown(queryClient)).toEqual([milk]);
    expect(changeFailed).toHaveBeenCalledOnce();
  });

  it("leaves the notice to the caller when it's quiet", async () => {
    const queryClient = appClient();
    queryClient.setQueryData(notesQuery().queryKey, [milk]);
    api.shout.mockRejectedValue(new DetailedError("Nope", { statusCode: 400 }));

    await expect(runChange(queryClient, changes.shout, "milk")).rejects.toThrow("Nope");
    expect(changeFailed).not.toHaveBeenCalled();
  });

  it("is still sent when its data isn't on the device", async () => {
    const queryClient = appClient();
    api.add.mockResolvedValue({});

    await runChange(queryClient, changes.add, bread);

    expect(api.add).toHaveBeenCalledExactlyOnceWith(bread);
    expect(shown(queryClient)).toBeUndefined();
  });

  it("shows the API's answer when only the API knows the result", async () => {
    const queryClient = appClient();
    queryClient.setQueryData(notesQuery().queryKey, [milk]);
    api.shout.mockResolvedValue("BUY MILK");

    await runChange(queryClient, changes.shout, "milk");

    expect(shown(queryClient)).toEqual([{ id: "milk", text: "BUY MILK" }]);
  });

  it("refetches its area once, after the last of several quick changes", async () => {
    const queryClient = appClient();
    queryClient.setQueryData(notesQuery().queryKey, []);
    const refetch = vi.spyOn(queryClient, "invalidateQueries");
    const first = deferred();
    const second = deferred();
    api.add.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);

    const sentFirst = runChange(queryClient, changes.add, milk);
    const sentSecond = runChange(queryClient, changes.add, bread);
    first.resolve({});
    await sentFirst;
    // An early refetch would bring back the list without bread, and the screen would flicker
    expect(refetch).not.toHaveBeenCalled();

    second.resolve({});
    await sentSecond;
    expect(refetch).toHaveBeenCalledExactlyOnceWith({ queryKey: ["todos"] });
  });
});

describe("undo", () => {
  it("puts back what the change removed", async () => {
    const queryClient = appClient();
    queryClient.setQueryData(notesQuery().queryKey, [milk, bread]);
    api.remove.mockResolvedValue({});
    api.restore.mockResolvedValue({});
    const onUndo = vi.fn();

    await runChange(queryClient, changes.remove, "milk", { message: "Milk removed", onUndo });
    expect(offerUndo).toHaveBeenCalledExactlyOnceWith(
      "Milk removed",
      expect.any(Function),
      undefined,
    );

    tapUndo();
    expect(onUndo).toHaveBeenCalledOnce();
    await vi.waitFor(() => expect(api.restore).toHaveBeenCalledExactlyOnceWith([milk]));
    expect(shown(queryClient)).toEqual([bread, milk]);
  });

  it("doesn't reach the API before the change it undoes", async () => {
    const queryClient = appClient();
    queryClient.setQueryData(notesQuery().queryKey, [milk]);
    const removal = deferred();
    api.remove.mockReturnValue(removal.promise);
    api.restore.mockResolvedValue({});

    const sent = runChange(queryClient, changes.remove, "milk", { message: "Milk removed" });
    await vi.waitFor(() => expect(api.remove).toHaveBeenCalled());
    tapUndo();
    await Promise.resolve();
    expect(api.restore).not.toHaveBeenCalled();

    removal.resolve({});
    await sent;
    await vi.waitFor(() => expect(api.restore).toHaveBeenCalledOnce());
  });

  it("isn't offered when there's nothing to take back", async () => {
    const queryClient = appClient();
    queryClient.setQueryData(notesQuery().queryKey, [bread]);
    api.remove.mockResolvedValue({});

    await runChange(queryClient, changes.remove, "milk", { message: "Milk removed" });
    expect(offerUndo).not.toHaveBeenCalled();
  });

  it("must run in order with the change it undoes", () => {
    const unordered = defineChange("todos", "unordered-restore", {
      idempotent: true,
      send: (_notes: Note[]) => Promise.resolve(),
      target: () => notesQuery().queryKey,
    });
    expect(() =>
      defineChange("todos", "unordered-remove", {
        idempotent: false,
        ordered: true,
        send: (_id: string) => Promise.resolve(),
        target: () => notesQuery().queryKey,
        undo: { by: unordered, vars: () => [] },
      }),
    ).toThrow("must both be ordered");
  });
});

describe("changes kept on the device", () => {
  it("sends a change made offline after the app restarts and the connection is back", async () => {
    onlineManager.setOnline(false);
    const before = appClient();
    before.setQueryData(notesQuery().queryKey, [milk]);

    void runChange(before, changes.add, bread).catch(() => {});
    await vi.waitFor(() => expect(shown(before)).toEqual([milk, bread]));

    const after = saveAndRestart(before);
    // Still on screen and still counted as waiting
    expect(shown(after)).toEqual([milk, bread]);
    expect(after.isMutating()).toBe(1);
    expect(api.add).not.toHaveBeenCalled();

    api.add.mockResolvedValue({});
    onlineManager.setOnline(true);
    await after.resumePausedMutations();

    expect(api.add).toHaveBeenCalledExactlyOnceWith(bread);
    expect(after.isMutating()).toBe(0);
  });

  it("resends an idempotent change whose request was on its way, but not another", async () => {
    const before = appClient();
    before.setQueryData(notesQuery().queryKey, [milk]);
    // Requests that never answer, as on one bar of signal
    api.add.mockReturnValue(new Promise(() => {}));
    api.remove.mockReturnValue(new Promise(() => {}));

    void runChange(before, changes.add, bread);
    void runChange(before, changes.remove, "milk");
    await vi.waitFor(() => expect(api.remove).toHaveBeenCalled());

    const after = saveAndRestart(before);
    const waiting = after.getMutationCache().getAll();
    expect(waiting.map((mutation) => mutation.options.mutationKey)).toEqual([
      ["todos", "change", "add"],
    ]);
    expect(waiting[0]?.state.isPaused).toBe(true);
  });

  it("keeps an undo that's waiting behind its change in order after a restart", async () => {
    onlineManager.setOnline(false);
    const before = appClient();
    before.setQueryData(notesQuery().queryKey, [milk]);

    void runChange(before, changes.remove, "milk", { message: "Milk removed" }).catch(() => {});
    await vi.waitFor(() => expect(shown(before)).toEqual([]));
    tapUndo();
    await vi.waitFor(() => expect(shown(before)).toEqual([milk]));
    // Lets both finish showing and start waiting for a connection, as they would before anyone
    // could close the app
    await new Promise((resolve) => setTimeout(resolve, 0));

    const after = saveAndRestart(before);
    const order: string[] = [];
    api.remove.mockImplementation(async () => void order.push("remove"));
    api.restore.mockImplementation(async () => void order.push("restore"));
    onlineManager.setOnline(true);
    await after.resumePausedMutations();
    await vi.waitFor(() => expect(after.isMutating()).toBe(0));

    expect(order).toEqual(["remove", "restore"]);
    expect(shown(after)).toEqual([milk]);
  });
});

describe("refetchArea", () => {
  it("waits while the person's own change is still being saved", async () => {
    const queryClient = appClient();
    queryClient.setQueryData(notesQuery().queryKey, []);
    const refetch = vi.spyOn(queryClient, "invalidateQueries");
    const request = deferred();
    api.add.mockReturnValue(request.promise);

    const sent = runChange(queryClient, changes.add, milk);
    refetchArea(queryClient, "todos");
    expect(refetch).not.toHaveBeenCalled();

    request.resolve({});
    await sent;
    refetch.mockClear();
    refetchArea(queryClient, "todos");
    expect(refetch).toHaveBeenCalledExactlyOnceWith({ queryKey: ["todos"] });
  });
});

describe("refetchEverything", () => {
  it("leaves an area alone while the person's own change there is still being saved", async () => {
    const queryClient = appClient();
    queryClient.setQueryData(notesQuery().queryKey, []);
    queryClient.setQueryData(["chores", "list"], []);
    queryClient.setQueryData(["reminders", "status"], {});
    const request = deferred();
    api.add.mockReturnValue(request.promise);

    const sent = runChange(queryClient, changes.add, milk);
    await vi.waitFor(() => expect(api.add).toHaveBeenCalled());
    refetchEverything(queryClient);

    expect(queryClient.getQueryState(notesQuery().queryKey)?.isInvalidated).toBe(false);
    expect(queryClient.getQueryState(["chores", "list"])?.isInvalidated).toBe(true);
    expect(queryClient.getQueryState(["reminders", "status"])?.isInvalidated).toBe(true);

    request.resolve({});
    await sent;
  });
});
