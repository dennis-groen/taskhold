import { QueryClient, dehydrate, hydrate, onlineManager } from "@tanstack/react-query";
import type { PersistedClient } from "@tanstack/query-persist-client-core";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { asWaiting, dehydrateOptions } from "@/lib/offline-cache.ts";

import type { ShoppingList } from "./shopping.api.ts";
import { registerShoppingMutations } from "./shopping.mutations.ts";
import { listQuery } from "./shopping.queries.ts";

const api = vi.hoisted(() => ({
  updateItem: vi.fn<(...args: unknown[]) => Promise<unknown>>(),
  deleteItem: vi.fn<(...args: unknown[]) => Promise<unknown>>(),
}));
vi.mock("./shopping.api.ts", () => ({
  ...api,
  addItem: vi.fn(),
  clearCheckedItems: vi.fn(),
  fetchList: vi.fn(),
  fetchLists: vi.fn(),
}));
vi.mock("@/lib/feedback.ts", () => ({ changeFailed: vi.fn(), offerUndo: vi.fn() }));

const me = { id: "me", name: "Me" };
const list: ShoppingList = {
  id: "list",
  name: "Groceries",
  items: [
    {
      id: "milk",
      name: "Milk",
      quantity: null,
      checked: false,
      addedBy: me,
      checkedBy: null,
      checkedAt: null,
      createdAt: "2026-11-01T12:00:00Z",
    },
  ],
};

/** A query client as the app sets one up, before anything is restored into it */
function appClient() {
  const queryClient = new QueryClient();
  registerShoppingMutations(queryClient);
  return queryClient;
}

/** Runs a change the way a page does, without waiting for it to finish */
function change(queryClient: QueryClient, name: string, variables: unknown) {
  void queryClient
    .getMutationCache()
    .build(queryClient, { mutationKey: ["shopping", "change", name] })
    .execute(variables)
    .catch(() => {});
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

beforeEach(() => {
  api.updateItem.mockReset();
  api.deleteItem.mockReset();
});

afterEach(() => {
  onlineManager.setOnline(true);
});

describe("shopping changes kept on the device", () => {
  it("sends a tick made offline after the app restarts and the connection is back", async () => {
    onlineManager.setOnline(false);
    const before = appClient();
    before.setQueryData(listQuery("list").queryKey, list);

    change(before, "toggle", { listId: "list", itemId: "milk", checked: true, by: me });
    await vi.waitFor(() =>
      expect(before.getQueryData(listQuery("list").queryKey)?.items[0]?.checked).toBe(true),
    );

    const after = saveAndRestart(before);
    // Still ticked on screen and still counted as waiting
    expect(after.getQueryData(listQuery("list").queryKey)?.items[0]?.checkedBy).toEqual(me);
    expect(after.isMutating()).toBe(1);
    expect(api.updateItem).not.toHaveBeenCalled();

    api.updateItem.mockResolvedValue({});
    onlineManager.setOnline(true);
    await after.resumePausedMutations();

    expect(api.updateItem).toHaveBeenCalledExactlyOnceWith("list", "milk", { checked: true });
    expect(after.isMutating()).toBe(0);
  });

  it("resends a tick whose request was on its way, but not a removal", async () => {
    const before = appClient();
    before.setQueryData(listQuery("list").queryKey, list);
    // Requests that never answer, as on one bar of signal
    api.updateItem.mockReturnValue(new Promise(() => {}));
    api.deleteItem.mockReturnValue(new Promise(() => {}));

    change(before, "toggle", { listId: "list", itemId: "milk", checked: true, by: me });
    change(before, "remove", { listId: "list", itemId: "milk" });
    await vi.waitFor(() => expect(api.deleteItem).toHaveBeenCalled());

    const after = saveAndRestart(before);
    const waiting = after.getMutationCache().getAll();
    expect(waiting.map((mutation) => mutation.options.mutationKey)).toEqual([
      ["shopping", "change", "toggle"],
    ]);
    expect(waiting[0]?.state.isPaused).toBe(true);
  });

  it("keeps only lists, chores and to-dos", () => {
    const queryClient = appClient();
    queryClient.setQueryData(listQuery("list").queryKey, list);
    queryClient.setQueryData(["reminders", "status"], { enabled: true });

    const { queries } = dehydrate(queryClient, dehydrateOptions);
    expect(queries.map((query) => query.queryKey)).toEqual([["shopping", "list", "list"]]);
  });
});
