// Putting something on a shopping list, from wherever it's asked for: the dock's field and chips,
// the chips on the list and the overview, and the Buy again sheet. One place decides what that
// means when the list has it already, remembers what was added or unticked on this visit (so a
// second tap takes it back and "✓ Added" chips stay put), and takes a group of them back as one
// Undo. Components only show the outcome.
import type { QueryClient } from "@tanstack/react-query";

import { runChange, type Change } from "@/lib/offline-changes.ts";
import type { PersonSummary } from "@/lib/shared-with.ts";

import { findOnList, itemKey, type Entry } from "./item-entry.ts";
import { stepQuantity } from "./item-quantity.ts";
import type { ShoppingItem } from "./shopping.api.ts";
import { shoppingChanges } from "./shopping.changes.ts";
import { listQuery } from "./shopping.queries.ts";

/** What putting something on the list did, or, for a clash, what it could do */
export type Outcome =
  /** It wasn't on the list, so it is now */
  | { kind: "added"; itemId: string; name: string; quantity: string | null }
  /** It was ticked and is waiting again; `amount` is the new amount, when it changed too */
  | { kind: "unticked"; item: ShoppingItem; amount: string | null }
  /** It was waiting with another amount */
  | { kind: "amount-set"; item: ShoppingItem; amount: string }
  /** It's waiting already, as asked */
  | { kind: "already-there"; item: ShoppingItem }
  /** The list has it already, and the caller asks the person what to do (see `settle`) */
  | { kind: "clash"; item: ShoppingItem; entry: Entry; nextAmount: string | null }
  /** A second tap took back what this visit added */
  | { kind: "taken-off"; itemId: string; name: string }
  /** A second tap ticked back what this visit unticked, for whoever had ticked it */
  | { kind: "ticked-again"; item: ShoppingItem };

export type Clash = Extract<Outcome, { kind: "clash" }>;

/** How a clash is settled: put it back on the list, change its amount, or add a second item */
export type ClashChoice = "untick" | "set-amount" | "add-row";

export type PutOptions = {
  /**
   * When the list has it already: "ask" returns a clash for the person to settle; "settle" acts
   * straight away (unticks a ticked item, or changes a waiting item's amount to a different one
   * asked for, else leaves it be)
   */
  onClash: "ask" | "settle";
  /** The amount to add it with when the entry gives none. Never changes an item already there. */
  usualQuantity?: string | null;
};

export type ListEntry = {
  put: (entry: Entry, options: PutOptions) => Outcome;
  /** Puts each on the list, settling clashes. Undo takes back every one of them. */
  putAll: (entries: readonly { name: string; quantity: string | null }[]) => {
    count: number;
    outcomes: Outcome[];
    undo: () => number;
  };
  settle: (clash: Clash, choice: ClashChoice) => Outcome;
  /** Takes back what this visit added or unticked; null when it did neither */
  takeBack: (name: string) => Outcome | null;
  /** Whether this visit added or unticked it, and it's still waiting */
  status: (name: string) => "added" | "unticked" | null;
  /** The items this visit added that are still waiting */
  addedIds: () => ReadonlySet<string>;
  /**
   * Takes back what the outcomes did, leaving anything someone has changed since (a housemate
   * ticked it, changed its amount, or it's gone). Returns how many it took back.
   */
  undo: (outcomes: readonly Outcome[]) => number;
  /**
   * Keeps this list's memory while held. The memory goes when the last holder lets go: a visit to
   * the list ends. Returns the release.
   */
  hold: () => () => void;
};

/** The amount "Make it …" offers for `item`, or null when there's nothing to offer */
export function nextAmount(item: ShoppingItem, entry: Entry): string | null {
  if (item.checked) return null;
  if (entry.quantity) return entry.quantity === item.quantity ? null : entry.quantity;
  return stepQuantity(item.quantity ?? "", 1) || null;
}

/** Putting things on one list, as `viewer` */
export function listEntry(
  queryClient: QueryClient,
  listId: string,
  viewer: PersonSummary,
): ListEntry {
  const store = storeFor(queryClient);
  const by = person(viewer);

  function items(): readonly ShoppingItem[] | undefined {
    return queryClient.getQueryData(listQuery(listId).queryKey)?.items;
  }

  function itemById(id: string): ShoppingItem | undefined {
    return items()?.find((item) => item.id === id);
  }

  function run<Vars>(change: Change<Vars>, vars: Vars) {
    // Failures roll back and say so themselves
    runChange(queryClient, change, vars).catch(() => {});
  }

  function add(name: string, quantity: string | null): Outcome {
    const id = crypto.randomUUID();
    run(shoppingChanges.add, { listId, id, name, quantity, by });
    store.write(listId, (memory) => ({
      ...memory,
      added: new Map(memory.added).set(itemKey(name), id),
    }));
    return { kind: "added", itemId: id, name, quantity };
  }

  function untick(item: ShoppingItem, amount: string | null): Outcome {
    run(shoppingChanges.toggle, { listId, itemId: item.id, checked: false, by });
    if (amount !== null) {
      run(shoppingChanges.edit, { listId, itemId: item.id, changes: { quantity: amount } });
    }
    store.write(listId, (memory) => ({
      ...memory,
      unticked: new Map(memory.unticked).set(itemKey(item.name), {
        id: item.id,
        checkedBy: item.checkedBy,
      }),
    }));
    return { kind: "unticked", item, amount };
  }

  function setAmount(item: ShoppingItem, amount: string): Outcome {
    run(shoppingChanges.edit, { listId, itemId: item.id, changes: { quantity: amount } });
    return { kind: "amount-set", item, amount };
  }

  function settleExisting(item: ShoppingItem, asked: string | null): Outcome {
    const different = asked !== null && asked !== item.quantity ? asked : null;
    if (item.checked) return untick(item, different);
    if (different !== null) return setAmount(item, different);
    return { kind: "already-there", item };
  }

  function forget(name: string) {
    const key = itemKey(name);
    store.write(listId, (memory) => {
      if (!memory.added.has(key) && !memory.unticked.has(key)) return memory;
      const added = new Map(memory.added);
      const unticked = new Map(memory.unticked);
      added.delete(key);
      unticked.delete(key);
      return { added, unticked };
    });
  }

  /** What this visit did to the item at `key`, while that item is still waiting */
  function remembered(
    key: string,
  ):
    | { kind: "added"; id: string }
    | { kind: "unticked"; item: ShoppingItem; checkedBy: PersonSummary | null }
    | null {
    const memory = store.read(listId);
    const list = items();
    const addedId = memory.added.get(key);
    if (addedId !== undefined) {
      const item = list?.find((candidate) => candidate.id === addedId);
      // Not on the list yet while its add waits behind a refetch; not cached at all on the overview
      if (item ? !item.checked : list === undefined || waitingAddIds().has(addedId)) {
        return { kind: "added", id: addedId };
      }
    }
    const unticked = memory.unticked.get(key);
    if (unticked !== undefined) {
      const item = list?.find((candidate) => candidate.id === unticked.id);
      if (item && !item.checked) return { kind: "unticked", item, checkedBy: unticked.checkedBy };
    }
    return null;
  }

  function waitingAddIds(): Set<string> {
    return new Set(
      queryClient
        .getMutationCache()
        .findAll({ mutationKey: shoppingChanges.add.key, status: "pending" })
        // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- saved by this change
        .map((mutation) => (mutation.state.variables as { id: string }).id),
    );
  }

  function put(entry: Entry, { onClash, usualQuantity = null }: PutOptions): Outcome {
    const list = items();
    const existing = list && findOnList(list, entry.name);
    if (!existing) return add(entry.name, entry.quantity ?? usualQuantity);
    if (onClash === "ask") {
      return { kind: "clash", item: existing, entry, nextAmount: nextAmount(existing, entry) };
    }
    return settleExisting(existing, entry.quantity);
  }

  function undoOne(outcome: Outcome): boolean {
    switch (outcome.kind) {
      case "added": {
        const now = itemById(outcome.itemId);
        // Only while it's still waiting: a housemate may have ticked it meanwhile
        if (now?.checked) return false;
        if (items() !== undefined && !now && !waitingAddIds().has(outcome.itemId)) return false;
        forget(outcome.name);
        run(shoppingChanges.remove, { listId, itemId: outcome.itemId });
        return true;
      }
      case "unticked": {
        const now = itemById(outcome.item.id);
        if (!now || now.checked) return false;
        if (outcome.amount !== null && now.quantity === outcome.amount) {
          run(shoppingChanges.edit, {
            listId,
            itemId: now.id,
            changes: { quantity: outcome.item.quantity },
          });
        }
        forget(outcome.item.name);
        run(shoppingChanges.toggle, {
          listId,
          itemId: now.id,
          checked: true,
          by: person(outcome.item.checkedBy ?? by),
        });
        return true;
      }
      case "amount-set": {
        const now = itemById(outcome.item.id);
        if (!now || now.quantity !== outcome.amount) return false;
        run(shoppingChanges.edit, {
          listId,
          itemId: now.id,
          changes: { quantity: outcome.item.quantity },
        });
        return true;
      }
      default:
        return false;
    }
  }

  function undo(outcomes: readonly Outcome[]): number {
    let taken = 0;
    for (const outcome of outcomes) if (undoOne(outcome)) taken++;
    return taken;
  }

  return {
    put,

    putAll: (entries) => {
      const outcomes = entries.map((entry) =>
        put(
          { name: entry.name, quantity: null },
          { onClash: "settle", usualQuantity: entry.quantity },
        ),
      );
      const changed = outcomes.filter(
        (outcome) => outcome.kind === "added" || outcome.kind === "unticked",
      );
      return { count: changed.length, outcomes: changed, undo: () => undo(changed) };
    },

    settle: (clash, choice) => {
      // The item as it is now: a housemate may have changed it while the card was up
      const item = itemById(clash.item.id) ?? clash.item;
      switch (choice) {
        case "untick":
          return item.checked ? untick(item, null) : { kind: "already-there", item };
        case "set-amount": {
          const amount = nextAmount(item, clash.entry);
          return amount === null ? { kind: "already-there", item } : setAmount(item, amount);
        }
        case "add-row":
          return add(clash.entry.name, clash.entry.quantity);
        default:
          return choice satisfies never;
      }
    },

    takeBack: (name) => {
      const found = remembered(itemKey(name));
      if (!found) return null;
      forget(name);
      if (found.kind === "added") {
        run(shoppingChanges.remove, { listId, itemId: found.id });
        return { kind: "taken-off", itemId: found.id, name };
      }
      run(shoppingChanges.toggle, {
        listId,
        itemId: found.item.id,
        checked: true,
        by: person(found.checkedBy ?? by),
      });
      return { kind: "ticked-again", item: found.item };
    },

    status: (name) => remembered(itemKey(name))?.kind ?? null,

    addedIds: () => {
      const ids = new Set<string>();
      for (const key of store.read(listId).added.keys()) {
        const found = remembered(key);
        if (found?.kind === "added") ids.add(found.id);
      }
      return ids;
    },

    undo,

    hold: () => store.hold(listId),
  };
}

/** Keeps `listId`'s memory while held, as ListEntry's `hold` does. Returns the release. */
export function holdListMemory(queryClient: QueryClient, listId: string): () => void {
  return storeFor(queryClient).hold(listId);
}

/** Subscribes to every list's memory on this query client, for components to follow it */
export function subscribeToListMemory(queryClient: QueryClient, onChange: () => void) {
  return storeFor(queryClient).subscribe(onChange);
}

/** This list's memory as it is now; a new object each time it changes */
export function listMemory(queryClient: QueryClient, listId: string): ListMemory {
  return storeFor(queryClient).read(listId);
}

/** What one visit to a list remembers, by item key */
type ListMemory = {
  readonly added: ReadonlyMap<string, string>;
  readonly unticked: ReadonlyMap<string, { id: string; checkedBy: PersonSummary | null }>;
};

const EMPTY: ListMemory = { added: new Map(), unticked: new Map() };

type Store = {
  read: (listId: string) => ListMemory;
  write: (listId: string, change: (memory: ListMemory) => ListMemory) => void;
  hold: (listId: string) => () => void;
  subscribe: (onChange: () => void) => () => void;
};

/** One store per query client, so each test (and each app) starts with nothing remembered */
const stores = new WeakMap<QueryClient, Store>();

function storeFor(queryClient: QueryClient): Store {
  const existing = stores.get(queryClient);
  if (existing) return existing;

  const memories = new Map<string, ListMemory>();
  const holders = new Map<string, number>();
  const listeners = new Set<() => void>();
  const notify = () => {
    for (const listener of listeners) listener();
  };

  const store: Store = {
    read: (listId) => memories.get(listId) ?? EMPTY,
    write: (listId, change) => {
      const before = memories.get(listId) ?? EMPTY;
      const after = change(before);
      if (after === before) return;
      memories.set(listId, after);
      notify();
    },
    hold: (listId) => {
      holders.set(listId, (holders.get(listId) ?? 0) + 1);
      let released = false;
      return () => {
        if (released) return;
        released = true;
        const left = (holders.get(listId) ?? 1) - 1;
        if (left > 0) {
          holders.set(listId, left);
          return;
        }
        holders.delete(listId);
        if (memories.delete(listId)) notify();
      };
    },
    subscribe: (onChange) => {
      listeners.add(onChange);
      return () => listeners.delete(onChange);
    },
  };
  stores.set(queryClient, store);
  return store;
}

/** Only what the list shows about a person, since a change is saved on the device with its variables */
function person({ id, name }: PersonSummary): PersonSummary {
  return { id, name };
}
