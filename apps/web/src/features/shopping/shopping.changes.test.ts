// What shopping's changes do to a list. Showing, rolling back, ordering and keeping changes on the
// device are lib/offline-changes.ts's, and tested there.
import { QueryClient, hydrate, onlineManager } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { offerUndo } from "@/lib/feedback.ts";
import { registerChanges, runChange } from "@/lib/offline-changes.ts";

import type { ShoppingList } from "./shopping.api.ts";
import { shoppingChanges } from "./shopping.changes.ts";
import { listQuery } from "./shopping.queries.ts";

const api = vi.hoisted(() => ({
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
  return queryClient;
}

function shown(queryClient: QueryClient) {
  return queryClient.getQueryData(listQuery("list").queryKey)?.items;
}

beforeEach(() => {
  vi.resetAllMocks();
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
