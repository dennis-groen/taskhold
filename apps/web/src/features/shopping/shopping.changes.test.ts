// What shopping's changes do to a list. Showing, rolling back, ordering and keeping changes on the
// device are lib/offline-changes.ts's, and tested there.
import { QueryClient, hydrate, onlineManager } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { offerUndo } from "@/lib/feedback.ts";
import { registerChanges, runChange } from "@/lib/offline-changes.ts";

import type { ShoppingList } from "./shopping.api.ts";
import { shoppingChanges } from "./shopping.changes.ts";
import { listQuery, listsQuery } from "./shopping.queries.ts";

const api = vi.hoisted(() => ({
  createList: vi.fn<(...args: unknown[]) => Promise<unknown>>(),
  renameList: vi.fn<(...args: unknown[]) => Promise<unknown>>(),
  deleteList: vi.fn<(...args: unknown[]) => Promise<unknown>>(),
  addItem: vi.fn<(...args: unknown[]) => Promise<unknown>>(),
  updateItem: vi.fn<(...args: unknown[]) => Promise<unknown>>(),
  deleteItem: vi.fn<(...args: unknown[]) => Promise<unknown>>(),
}));
vi.mock("./shopping.api.ts", () => ({
  ...api,
  clearCheckedItems: vi.fn(),
  fetchHistory: vi.fn(),
  fetchList: vi.fn(),
  fetchLists: vi.fn(),
}));
vi.mock("@/lib/feedback.ts", () => ({ changeFailed: vi.fn(), offerUndo: vi.fn() }));

const me = { id: "me", name: "Me" };
const milk = {
  id: "milk",
  name: "Milk",
  quantity: "2",
  checked: true,
  addedBy: me,
  checkedBy: me,
  checkedAt: "2026-11-01T12:30:00Z",
  createdAt: "2026-11-01T12:00:00Z",
};
const bread = {
  ...milk,
  id: "bread",
  name: "Bread",
  checked: false,
  checkedBy: null,
  checkedAt: null,
};
const list: ShoppingList = { id: "list", name: "Groceries", items: [milk, bread] };

function appClient() {
  const queryClient = new QueryClient();
  registerChanges(queryClient, shoppingChanges);
  queryClient.setQueryData(listQuery("list").queryKey, list);
  queryClient.setQueryData(listsQuery().queryKey, [
    { id: "list", name: "Groceries", itemCount: 2, openCount: 1 },
  ]);
  return queryClient;
}

function listNames(queryClient: QueryClient) {
  return queryClient.getQueryData(listsQuery().queryKey)?.map((summary) => summary.name);
}

function shown(queryClient: QueryClient) {
  return queryClient.getQueryData(listQuery("list").queryKey)?.items;
}

beforeEach(() => {
  vi.resetAllMocks();
  api.createList.mockResolvedValue({});
  api.renameList.mockResolvedValue(undefined);
  api.deleteList.mockResolvedValue(undefined);
  api.addItem.mockResolvedValue({});
  api.updateItem.mockResolvedValue({});
  api.deleteItem.mockResolvedValue({});
});

afterEach(() => {
  onlineManager.setOnline(true);
});

describe("shopping changes", () => {
  it("shows a tick with who made it, and sends only the tick", async () => {
    const queryClient = appClient();
    await runChange(queryClient, shoppingChanges.toggle, {
      listId: "list",
      itemId: "bread",
      checked: true,
      by: me,
    });

    expect(shown(queryClient)?.[1]).toMatchObject({ checked: true, checkedBy: me });
    expect(api.updateItem).toHaveBeenCalledExactlyOnceWith("list", "bread", { checked: true });
  });

  it("sends a tick and its untick one after the other, in the order they were made", async () => {
    const queryClient = appClient();
    const answers: ((value: unknown) => void)[] = [];
    api.updateItem.mockReturnValueOnce(
      new Promise((resolve) => {
        answers.push(resolve);
      }),
    );
    const item = { listId: "list", itemId: "bread", by: me };

    const tick = runChange(queryClient, shoppingChanges.toggle, { ...item, checked: true });
    const untick = runChange(queryClient, shoppingChanges.toggle, { ...item, checked: false });
    await vi.waitFor(() => expect(api.updateItem).toHaveBeenCalled());
    // The untick waits for the tick's answer
    expect(api.updateItem).toHaveBeenCalledTimes(1);

    answers[0]?.({});
    await Promise.all([tick, untick]);
    expect(api.updateItem.mock.calls.map((call) => call[2])).toEqual([
      { checked: true },
      { checked: false },
    ]);
  });

  it("runs adds in order with the other changes, so a tick can't arrive before its item", () => {
    expect(shoppingChanges.add.ordered).toBe(true);
    expect(shoppingChanges.toggle.ordered).toBe(true);
  });

  it("sends only the fields an edit changed, so a housemate's other edit stays", async () => {
    const queryClient = appClient();
    await runChange(queryClient, shoppingChanges.edit, {
      listId: "list",
      itemId: "milk",
      changes: { quantity: "3" },
    });

    expect(shown(queryClient)?.[0]).toMatchObject({ name: "Milk", quantity: "3" });
    expect(api.updateItem).toHaveBeenCalledExactlyOnceWith("list", "milk", { quantity: "3" });
  });

  it("puts a removed item back with its id, still ticked, when someone taps Undo", async () => {
    const queryClient = appClient();
    await runChange(
      queryClient,
      shoppingChanges.remove,
      { listId: "list", itemId: "milk" },
      { message: "Milk removed" },
    );
    expect(shown(queryClient)).toEqual([bread]);

    vi.mocked(offerUndo).mock.lastCall?.[1]();
    await vi.waitFor(() => expect(api.updateItem).toHaveBeenCalled());

    expect(api.addItem).toHaveBeenCalledExactlyOnceWith("list", {
      id: "milk",
      name: "Milk",
      quantity: "2",
    });
    expect(api.updateItem).toHaveBeenCalledExactlyOnceWith("list", "milk", { checked: true });
    expect(shown(queryClient)).toEqual([milk, bread]);
  });

  it("offers nothing to undo when nothing was ticked", async () => {
    const queryClient = new QueryClient();
    registerChanges(queryClient, shoppingChanges);
    queryClient.setQueryData(listQuery("list").queryKey, { ...list, items: [bread] });

    await runChange(
      queryClient,
      shoppingChanges.clearChecked,
      { listId: "list" },
      { message: "Cleared" },
    );
    expect(offerUndo).not.toHaveBeenCalled();
  });

  it("shows a new list straight away, made with the app's id, before the items added to it", async () => {
    const queryClient = appClient();
    const made = runChange(queryClient, shoppingChanges.createList, { id: "new", name: "Market" });
    const added = runChange(queryClient, shoppingChanges.add, {
      listId: "new",
      id: "eggs",
      name: "Eggs",
      quantity: null,
      by: me,
    });
    await vi.waitFor(() => expect(listNames(queryClient)).toEqual(["Groceries", "Market"]));

    await Promise.all([made, added]);
    expect(api.createList).toHaveBeenCalledExactlyOnceWith({ id: "new", name: "Market" });
    expect(api.createList.mock.invocationCallOrder[0]).toBeLessThan(
      api.addItem.mock.invocationCallOrder[0] ?? 0,
    );
  });

  it("takes a new list back off the overview when the API turns it down", async () => {
    const queryClient = appClient();
    api.createList.mockRejectedValueOnce(new Error("LIST_LIMIT_REACHED"));
    await expect(
      runChange(queryClient, shoppingChanges.createList, { id: "new", name: "Market" }),
    ).rejects.toThrow();
    expect(listNames(queryClient)).toEqual(["Groceries"]);
  });

  it("shows a list's new name straight away", async () => {
    const queryClient = appClient();
    await runChange(queryClient, shoppingChanges.renameList, { listId: "list", name: "Market" });

    expect(queryClient.getQueryData(listQuery("list").queryKey)?.name).toBe("Market");
    expect(api.renameList).toHaveBeenCalledExactlyOnceWith("list", "Market");
  });

  it("takes a deleted list off the overview, and keeps the delete across a restart", async () => {
    const queryClient = appClient();
    await runChange(queryClient, shoppingChanges.deleteList, { listId: "list" });

    expect(listNames(queryClient)).toEqual([]);
    expect(api.deleteList).toHaveBeenCalledExactlyOnceWith("list");
    expect(shoppingChanges.deleteList.options(queryClient).meta.idempotent).toBe(true);
  });

  it("still sends a tick that an earlier version of the app saved on the device", async () => {
    onlineManager.setOnline(false);
    const queryClient = appClient();
    // As the app saved it before changes had their own module: same key, same variables
    hydrate(queryClient, {
      queries: [],
      mutations: [
        {
          mutationKey: ["shopping", "change", "toggle"],
          meta: { idempotent: true },
          state: {
            context: { previous: list },
            data: undefined,
            error: null,
            failureCount: 0,
            failureReason: null,
            isPaused: true,
            status: "pending",
            variables: { listId: "list", itemId: "bread", checked: true, by: me },
            submittedAt: 0,
          },
        },
      ],
    });

    onlineManager.setOnline(true);
    await queryClient.resumePausedMutations();

    expect(api.updateItem).toHaveBeenCalledExactlyOnceWith("list", "bread", { checked: true });
  });
});
