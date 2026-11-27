// What putting something on a list does when the list has it already, what a visit remembers,
// and what a group Undo takes back. Driven through listEntry with a seeded query client and the
// API mocked, as shopping.changes.test.ts does.
import { QueryClient } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { registerChanges } from "@/lib/offline-changes.ts";

import { listEntry, nextAmount, type Clash } from "./list-entry.ts";
import type { ShoppingItem, ShoppingList } from "./shopping.api.ts";
import { shoppingChanges } from "./shopping.changes.ts";
import { listQuery, listsQuery } from "./shopping.queries.ts";

const api = vi.hoisted(() => ({
  addItem: vi.fn<(...args: unknown[]) => Promise<unknown>>(),
  updateItem: vi.fn<(...args: unknown[]) => Promise<unknown>>(),
  deleteItem: vi.fn<(...args: unknown[]) => Promise<unknown>>(),
}));
vi.mock("./shopping.api.ts", () => ({
  ...api,
  createList: vi.fn(),
  renameList: vi.fn(),
  deleteList: vi.fn(),
  forgetHistory: vi.fn(),
  clearCheckedItems: vi.fn(),
  fetchHistory: vi.fn(),
  fetchList: vi.fn(),
  fetchLists: vi.fn(),
}));
vi.mock("@/lib/feedback.ts", () => ({ changeFailed: vi.fn(), offerUndo: vi.fn() }));

const me = { id: "me", name: "Me" };
const sam = { id: "sam", name: "Sam Field" };

function item(fields: Partial<ShoppingItem> & Pick<ShoppingItem, "id" | "name">): ShoppingItem {
  return {
    quantity: null,
    checked: false,
    addedBy: me,
    checkedBy: null,
    checkedAt: null,
    createdAt: "2026-11-01T12:00:00Z",
    ...fields,
  };
}

// Milk is ticked, by Sam; Bread is waiting, two of them
const milk = item({
  id: "milk",
  name: "Milk",
  checked: true,
  checkedBy: sam,
  checkedAt: "2026-11-01T12:30:00Z",
});
const bread = item({ id: "bread", name: "Bread", quantity: "2" });

function setup(items: ShoppingItem[] = [milk, bread]) {
  const queryClient = new QueryClient();
  registerChanges(queryClient, shoppingChanges);
  const list: ShoppingList = { id: "list", name: "Groceries", items, trip: null };
  queryClient.setQueryData(listQuery("list").queryKey, list);
  queryClient.setQueryData(listsQuery().queryKey, [
    { id: "list", name: "Groceries", itemCount: items.length, openCount: 1 },
  ]);
  const entry = listEntry(queryClient, "list", me);
  return { queryClient, entry };
}

function shown(queryClient: QueryClient, name: string) {
  return queryClient
    .getQueryData(listQuery("list").queryKey)
    ?.items.find((candidate) => candidate.name === name);
}

/** The changes reach the cache a moment after they're run */
async function settled(queryClient: QueryClient) {
  await vi.waitFor(() => expect(queryClient.isMutating()).toBe(0));
}

/** A housemate's change, arriving through a refetch */
function housemate(queryClient: QueryClient, id: string, fields: Partial<ShoppingItem>) {
  queryClient.setQueryData(listQuery("list").queryKey, (list) =>
    list
      ? {
          ...list,
          items: list.items.map((candidate) =>
            candidate.id === id ? { ...candidate, ...fields } : candidate,
          ),
        }
      : list,
  );
}

beforeEach(() => {
  vi.resetAllMocks();
  api.addItem.mockResolvedValue({});
  api.updateItem.mockResolvedValue({});
  api.deleteItem.mockResolvedValue({});
});

describe("putting something on a list", () => {
  it("adds what isn't there, with the usual amount when none was asked for", async () => {
    const { queryClient, entry } = setup();

    const outcome = entry.put(
      { name: "Eggs", quantity: null },
      { onClash: "settle", usualQuantity: "12" },
    );

    expect(outcome).toMatchObject({ kind: "added", name: "Eggs", quantity: "12" });
    await settled(queryClient);
    expect(shown(queryClient, "Eggs")).toMatchObject({ quantity: "12", checked: false });
    expect(entry.status("eggs")).toBe("added");
  });

  it("puts a ticked item back on the list instead of adding a second one", async () => {
    const { queryClient, entry } = setup();

    const outcome = entry.put({ name: "milk", quantity: null }, { onClash: "settle" });

    expect(outcome).toMatchObject({ kind: "unticked", amount: null });
    await settled(queryClient);
    expect(shown(queryClient, "Milk")).toMatchObject({ checked: false });
    expect(api.addItem).not.toHaveBeenCalled();
    expect(entry.status("Milk")).toBe("unticked");
  });

  it("unticks with the new amount when a different one was asked for", async () => {
    const { queryClient, entry } = setup();

    entry.put({ name: "Milk", quantity: "3" }, { onClash: "settle" });

    await settled(queryClient);
    expect(shown(queryClient, "Milk")).toMatchObject({ checked: false, quantity: "3" });
  });

  it("changes a waiting item's amount when a different one was asked for", async () => {
    const { queryClient, entry } = setup();

    const outcome = entry.put({ name: "Bread", quantity: "4" }, { onClash: "settle" });

    expect(outcome).toMatchObject({ kind: "amount-set", amount: "4" });
    await settled(queryClient);
    expect(shown(queryClient, "Bread")).toMatchObject({ quantity: "4" });
  });

  it("leaves a waiting item be when no amount, or the same one, was asked for", () => {
    const { entry } = setup();

    expect(entry.put({ name: "Bread", quantity: null }, { onClash: "settle" }).kind).toBe(
      "already-there",
    );
    expect(entry.put({ name: "Bread", quantity: "2" }, { onClash: "settle" }).kind).toBe(
      "already-there",
    );
    // The usual amount is for adding, never for changing what's there
    expect(
      entry.put({ name: "Bread", quantity: null }, { onClash: "settle", usualQuantity: "6" }).kind,
    ).toBe("already-there");
    expect(api.updateItem).not.toHaveBeenCalled();
  });

  it("asks instead of acting when told to, offering one more or the amount typed", () => {
    const { entry } = setup();

    expect(entry.put({ name: "Bread", quantity: null }, { onClash: "ask" })).toMatchObject({
      kind: "clash",
      nextAmount: "3",
    });
    expect(entry.put({ name: "Milk", quantity: null }, { onClash: "ask" })).toMatchObject({
      kind: "clash",
      nextAmount: null,
    });
    expect(api.updateItem).not.toHaveBeenCalled();
    expect(api.addItem).not.toHaveBeenCalled();
  });
});

describe("the amount a clash offers", () => {
  it("is one more, the amount typed, or nothing when that's what it is already", () => {
    const waiting = item({ id: "x", name: "Oats", quantity: "2 bags" });
    expect(nextAmount(waiting, { name: "Oats", quantity: null })).toBe("3 bags");
    expect(nextAmount(waiting, { name: "Oats", quantity: "5" })).toBe("5");
    expect(nextAmount(waiting, { name: "Oats", quantity: "2 bags" })).toBeNull();
    expect(nextAmount({ ...waiting, quantity: null }, { name: "Oats", quantity: null })).toBe("2");
    expect(nextAmount({ ...waiting, quantity: "500 g" }, { name: "Oats", quantity: null })).toBe(
      null,
    );
  });
});

function clash(entry: ReturnType<typeof setup>["entry"], name: string): Clash {
  const outcome = entry.put({ name, quantity: null }, { onClash: "ask" });
  if (outcome.kind !== "clash") throw new Error(`expected a clash, got ${outcome.kind}`);
  return outcome;
}

describe("settling a clash", () => {
  it("unticks", async () => {
    const { queryClient, entry } = setup();
    entry.settle(clash(entry, "Milk"), "untick");
    await settled(queryClient);
    expect(shown(queryClient, "Milk")).toMatchObject({ checked: false });
  });

  it("sets the amount it offered, judged on the item as it is now", async () => {
    const { queryClient, entry } = setup();
    const asked = clash(entry, "Bread");
    housemate(queryClient, "bread", { quantity: "3" });

    expect(entry.settle(asked, "set-amount")).toMatchObject({ kind: "amount-set", amount: "4" });
    await settled(queryClient);
    expect(shown(queryClient, "Bread")).toMatchObject({ quantity: "4" });
  });

  it("adds a second item", async () => {
    const { queryClient, entry } = setup();
    entry.settle(clash(entry, "Bread"), "add-row");
    await settled(queryClient);
    expect(
      queryClient.getQueryData(listQuery("list").queryKey)?.items.filter((i) => i.name === "Bread"),
    ).toHaveLength(2);
  });
});

describe("a second tap", () => {
  it("takes off what this visit added", async () => {
    const { queryClient, entry } = setup();
    entry.put({ name: "Eggs", quantity: null }, { onClash: "settle" });
    await settled(queryClient);

    expect(entry.takeBack("Eggs")).toMatchObject({ kind: "taken-off" });
    await settled(queryClient);
    expect(shown(queryClient, "Eggs")).toBeUndefined();
    expect(entry.status("Eggs")).toBeNull();
  });

  it("ticks back what this visit unticked, for whoever had ticked it", async () => {
    const { queryClient, entry } = setup();
    entry.put({ name: "Milk", quantity: null }, { onClash: "settle" });
    await settled(queryClient);

    expect(entry.takeBack("Milk")).toMatchObject({ kind: "ticked-again" });
    await settled(queryClient);
    expect(shown(queryClient, "Milk")).toMatchObject({ checked: true, checkedBy: sam });
  });

  it("never takes off what was on the list before this visit", () => {
    const { entry } = setup();
    expect(entry.takeBack("Bread")).toBeNull();
    expect(api.deleteItem).not.toHaveBeenCalled();
  });

  it("forgets an added item once someone ticks it", async () => {
    const { queryClient, entry } = setup();
    const added = entry.put({ name: "Eggs", quantity: null }, { onClash: "settle" });
    await settled(queryClient);
    if (added.kind !== "added") throw new Error("expected an add");

    expect(entry.addedIds()).toEqual(new Set([added.itemId]));
    housemate(queryClient, added.itemId, { checked: true, checkedBy: sam });
    expect(entry.status("Eggs")).toBeNull();
    expect(entry.addedIds()).toEqual(new Set());
  });
});

describe("putting several on at once", () => {
  it("adds and unticks them, and one Undo takes them all back", async () => {
    const { queryClient, entry } = setup();

    const all = entry.putAll([
      { name: "Eggs", quantity: "6" },
      { name: "Milk", quantity: "1" },
      { name: "Bread", quantity: null },
    ]);

    // Bread was waiting already, so it doesn't count
    expect(all.count).toBe(2);
    await settled(queryClient);
    expect(shown(queryClient, "Eggs")).toMatchObject({ quantity: "6" });
    expect(shown(queryClient, "Milk")).toMatchObject({ checked: false, quantity: null });

    expect(all.undo()).toBe(2);
    await settled(queryClient);
    expect(shown(queryClient, "Eggs")).toBeUndefined();
    expect(shown(queryClient, "Milk")).toMatchObject({ checked: true, checkedBy: sam });
    expect(entry.status("Eggs")).toBeNull();
    expect(entry.status("Milk")).toBeNull();
  });

  it("leaves what a housemate has changed since", async () => {
    const { queryClient, entry } = setup();
    const all = entry.putAll([
      { name: "Eggs", quantity: null },
      { name: "Milk", quantity: null },
    ]);
    await settled(queryClient);
    const eggs = shown(queryClient, "Eggs");
    if (!eggs) throw new Error("expected Eggs on the list");
    housemate(queryClient, eggs.id, { checked: true, checkedBy: sam });

    expect(all.undo()).toBe(1);
    await settled(queryClient);
    expect(shown(queryClient, "Eggs")).toMatchObject({ checked: true, checkedBy: sam });
    expect(shown(queryClient, "Milk")).toMatchObject({ checked: true });
  });

  it("leaves an amount a housemate changed after this one", async () => {
    const { queryClient, entry } = setup();
    const outcome = entry.put({ name: "Bread", quantity: "4" }, { onClash: "settle" });
    await settled(queryClient);
    housemate(queryClient, "bread", { quantity: "5" });

    expect(entry.undo([outcome])).toBe(0);
    expect(shown(queryClient, "Bread")).toMatchObject({ quantity: "5" });
  });

  it("puts an amount back when nobody changed it since", async () => {
    const { queryClient, entry } = setup();
    const outcome = entry.put({ name: "Bread", quantity: "4" }, { onClash: "settle" });
    await settled(queryClient);

    expect(entry.undo([outcome])).toBe(1);
    await settled(queryClient);
    expect(shown(queryClient, "Bread")).toMatchObject({ quantity: "2" });
  });
});

describe("a visit's memory", () => {
  it("lasts while anyone holds the list, and goes with the last of them", async () => {
    const { queryClient, entry } = setup();
    const dock = entry.hold();
    const sheet = entry.hold();
    entry.put({ name: "Eggs", quantity: null }, { onClash: "settle" });
    await settled(queryClient);

    sheet();
    expect(entry.status("Eggs")).toBe("added");
    dock();
    expect(entry.status("Eggs")).toBeNull();
  });

  it("is shared by everything showing the list", async () => {
    const { queryClient, entry } = setup();
    entry.put({ name: "Eggs", quantity: null }, { onClash: "settle" });
    await settled(queryClient);

    expect(listEntry(queryClient, "list", me).status("Eggs")).toBe("added");
    expect(listEntry(new QueryClient(), "list", me).status("Eggs")).toBeNull();
  });

  it("remembers an add to a list that isn't on the device", async () => {
    const queryClient = new QueryClient();
    registerChanges(queryClient, shoppingChanges);
    const entry = listEntry(queryClient, "elsewhere", me);

    entry.put({ name: "Eggs", quantity: null }, { onClash: "settle" });

    expect(entry.status("Eggs")).toBe("added");
    await vi.waitFor(() => expect(api.addItem).toHaveBeenCalledOnce());
  });
});
