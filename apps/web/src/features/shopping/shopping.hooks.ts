import {
  onlineManager,
  useQuery,
  useQueryClient,
  useSuspenseQuery,
  type QueryClient,
} from "@tanstack/react-query";
import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { toast } from "sonner";
import { changeFailed } from "@/lib/feedback.ts";
import { useChange, useWaitingVars } from "@/lib/offline-changes.ts";
import { firstName, type PersonSummary } from "@/lib/shared-with.ts";

import { itemKey } from "./item-entry.ts";
import {
  endTrip,
  startTrip,
  type BoughtItem,
  type ShoppingList,
  type ShoppingListSummary,
  type ShoppingTrip,
} from "./shopping.api.ts";
import { shoppingChanges, type ItemChanges } from "./shopping.changes.ts";
import {
  browseBuyAgain,
  suggestBuyAgain,
  type BuyAgainCatalog,
  type BuyAgainSuggestion,
} from "./buy-again.ts";
import { historyQuery, isListGone, listQuery, listsQuery } from "./shopping.queries.ts";

/**
 * A list plus the changes people make to it. Every change shows on screen straight away and is
 * rolled back if the API rejects it (see shopping.changes.ts).
 */
export function useShoppingList(listId: string, viewer: PersonSummary) {
  const { data: list, error: refetchError } = useSuspenseQuery(listQuery(listId));
  const toggle = useChange(shoppingChanges.toggle);
  const edit = useChange(shoppingChanges.edit);
  const remove = useChange(shoppingChanges.remove);
  const clearChecked = useChange(shoppingChanges.clearChecked);

  return {
    list,
    /** Someone deleted the list while it was open */
    gone: isListGone(refetchError),
    toggle: (itemId: string, checked: boolean) =>
      toggle.run({ listId, itemId, checked, by: person(viewer) }),
    /** Changes the name and quantity; leave a field out to keep it */
    edit: (itemId: string, changes: ItemChanges) => edit.run({ listId, itemId, changes }),
    remove: (itemId: string) => {
      const item = list.items.find((candidate) => candidate.id === itemId);
      if (!item) return;
      remove.run({ listId, itemId }, { message: `${item.name} removed` });
    },
    clearChecked: () => {
      const ticked = list.items.filter((item) => item.checked);
      if (ticked.length === 0) return;
      clearChecked.run(
        { listId },
        { message: cleared(ticked.length), detail: namesOf(ticked.map((item) => item.name)) },
      );
    },
  };
}

/**
 * Someone out shopping for the list. Needs a connection on purpose: a ping that waits offline and
 * goes out at the checkout is worse than none, so this is a plain call, not an offline change.
 */
export function useShoppingTrip(listId: string, viewer: PersonSummary) {
  const queryClient = useQueryClient();
  const { data: list } = useSuspenseQuery(listQuery(listId));
  const [starting, setStarting] = useState(false);
  const online = useSyncExternalStore(
    (onChange) => onlineManager.subscribe(onChange),
    () => onlineManager.isOnline(),
  );
  // A list saved on the device before trips existed has no trip field
  const trip = list.trip ?? null;

  function setTrip(next: ShoppingTrip | null) {
    queryClient.setQueryData(listQuery(listId).queryKey, (current: ShoppingList | undefined) =>
      current ? { ...current, trip: next } : current,
    );
  }

  return {
    trip,
    mine: trip?.shopper?.id === viewer.id,
    online,
    starting,
    start: async () => {
      setStarting(true);
      try {
        const started = await startTrip(listId, crypto.randomUUID());
        setTrip(started);
        if (started.shopper && started.shopper.id !== viewer.id) {
          toast(`${firstName(started.shopper.name)} is already out shopping.`);
        }
      } catch (err) {
        changeFailed(err, "Couldn't let everyone know. Try again.");
      } finally {
        setStarting(false);
      }
    },
    end: async () => {
      setTrip(null);
      try {
        await endTrip(listId);
      } catch (err) {
        await queryClient.invalidateQueries({ queryKey: listQuery(listId).queryKey });
        changeFailed(err, "Couldn't end your trip. Try again.");
      }
    },
  };
}

/**
 * Making, renaming and deleting lists. They show straight away, wait for a connection and survive
 * a restart (see shopping.changes.ts); a failure rolls back with a notice.
 */
export function useManageLists() {
  const queryClient = useQueryClient();
  const createList = useChange(shoppingChanges.createList);
  const renameList = useChange(shoppingChanges.renameList);
  const deleteList = useChange(shoppingChanges.deleteList);

  return {
    /** Returns the new list's id, so it can be opened straight away */
    create: (name: string) => {
      const id = crypto.randomUUID();
      // The new list opens before the API has it, offline too
      queryClient.setQueryData(listQuery(id).queryKey, { id, name, items: [], trip: null });
      createList.run({ id, name });
      return id;
    },
    rename: (listId: string, name: string) => {
      renameList.run({ listId, name });
      // The overview shows the name too; the refetch after the change puts it right if it fails
      queryClient.setQueryData(listsQuery().queryKey, (lists: ShoppingListSummary[] | undefined) =>
        lists?.map((list) => (list.id === listId ? { ...list, name } : list)),
      );
    },
    /** Call once the list's page has been left, so it doesn't look for a list that's gone */
    remove: (listId: string) => {
      deleteList.run({ listId });
      queryClient.removeQueries({ queryKey: listQuery(listId).queryKey });
    },
  };
}

/** Adds an item to any list, optimistically when that list is on screen or cached */
export function useAddItem(viewer: PersonSummary) {
  const queryClient = useQueryClient();
  const add = useChange(shoppingChanges.add);
  return (listId: string, name: string, quantity: string | null) => {
    const id = crypto.randomUUID();
    add.run({ listId, id, name, quantity, by: person(viewer) });
    // The overview and sidebar show list counts too; the refetch after the change puts them right
    // if it fails
    adjustListCounts(queryClient, listId, { itemCount: 1, openCount: 1 });
    return id;
  };
}

/** Removes an item quietly, without an undo toast, e.g. toggling a Buy again chip back off */
export function useUndoAddItem() {
  const queryClient = useQueryClient();
  const remove = useChange(shoppingChanges.remove);
  return (listId: string, itemId: string) => {
    remove.run({ listId, itemId });
    adjustListCounts(queryClient, listId, { itemCount: -1, openCount: -1 });
  };
}

/** Changes an item's name or quantity on any list; leave a field out to keep it */
export function useEditItem(listId: string | undefined) {
  const edit = useChange(shoppingChanges.edit);
  return (itemId: string, changes: ItemChanges) => {
    if (listId) edit.run({ listId, itemId, changes });
  };
}

/** Ticks or unticks an item on a list; defaults `by` to the viewer */
export function useToggleItem(listId: string, viewer: PersonSummary) {
  const toggle = useChange(shoppingChanges.toggle);
  return (itemId: string, checked: boolean, by: PersonSummary = viewer) =>
    toggle.run({ listId, itemId, checked, by: person(by) });
}

/** Item ids whose ticks are saved on this device and still waiting to reach the server */
export function usePendingToggleIds(): Set<string> {
  return new Set(useWaitingVars(shoppingChanges.toggle).map((vars) => vars.itemId));
}

/**
 * Tracks idle Buy again chips tapped in this session so they stay in place as "✓ Added" instead
 * of vanishing and shifting neighbouring chips under the thumb. Automatically clears entries if
 * the item is ticked off or removed elsewhere.
 */
export function useBuyAgainState(listId: string | undefined) {
  const { data: list } = useQuery({ ...listQuery(listId ?? ""), enabled: listId !== undefined });
  const pendingAddSignature = useWaitingVars(shoppingChanges.add)
    .filter((vars) => vars.listId === listId)
    .map((vars) => vars.id)
    .toSorted()
    .join("\0");
  // Keyed by `${listId}:${itemKey(name)}` so switching target lists on the overview keeps each
  // list's session taps intact
  const [picked, setPicked] = useState<Record<string, string>>({});

  const activeByKey = useMemo(() => {
    const map = new Map<string, string>();
    if (!listId) return map;
    const pendingAddIds = new Set(pendingAddSignature ? pendingAddSignature.split("\0") : []);
    const openIds = new Set(list?.items.filter((item) => !item.checked).map((item) => item.id));
    const checkedIds = new Set(list?.items.filter((item) => item.checked).map((item) => item.id));
    const prefix = `${listId}:`;
    for (const [compoundKey, id] of Object.entries(picked)) {
      if (!compoundKey.startsWith(prefix)) continue;
      if (checkedIds.has(id)) continue;
      if (list !== undefined && !openIds.has(id) && !pendingAddIds.has(id)) continue;
      map.set(compoundKey.slice(prefix.length), id);
    }
    return map;
  }, [listId, list, picked, pendingAddSignature]);

  const pinnedSignature = [...activeByKey.values()].toSorted().join("\0");
  const pinnedIds = useMemo(
    () => new Set(pinnedSignature ? pinnedSignature.split("\0") : []),
    [pinnedSignature],
  );

  return {
    pinnedIds,
    addedIdFor: (name: string) => activeByKey.get(itemKey(name)),
    markAdded: (name: string, id: string) => {
      if (!listId) return;
      const key = `${listId}:${itemKey(name)}`;
      setPicked((prev) => ({ ...prev, [key]: id }));
    },
    clearAdded: (name: string) => {
      if (!listId) return;
      const key = `${listId}:${itemKey(name)}`;
      setPicked((prev) => {
        if (!(key in prev)) return prev;
        const next = { ...prev };
        delete next[key];
        return next;
      });
    },
  };
}

/** Removes an item (and its merged spellings) from Buy again history on the server */
export function useForgetBuyAgain() {
  const forget = useChange(shoppingChanges.forgetHistory);
  return (names: string[]) => {
    if (names.length > 0) forget.run({ names });
  };
}

/**
 * "Buy again" suggestions for a list: the household's regulars for this list (boosted by items
 * often bought together with what's already on the list), or past buys matching what's typed,
 * leaving out what's already waiting on that list (except idle chips pinned in this session).
 * Nothing until the history has loaded.
 */
export function useBuyAgain(
  listId: string | undefined,
  typed: string,
  pinnedIds?: ReadonlySet<string>,
): BuyAgainSuggestion[] {
  const history = useQuery(historyQuery()).data ?? NO_HISTORY;
  const { data: list } = useQuery({ ...listQuery(listId ?? ""), enabled: listId !== undefined });
  // "Due" is judged once per screen, so chips don't reshuffle while someone is picking
  const [now] = useState(() => Temporal.Now.instant());
  return useMemo(() => {
    const isTyping = typed.trim() !== "";
    const allOpen = list?.items.filter((item) => !item.checked) ?? [];
    const onList = allOpen
      .filter((item) => isTyping || !pinnedIds?.has(item.id))
      .map((item) => item.name);
    const inBasket = allOpen.map((item) => item.name);
    const checkedOnList = list?.items.filter((item) => item.checked).map((item) => item.name) ?? [];
    return suggestBuyAgain(history, { now, typed, listId, onList, inBasket, checkedOnList });
  }, [history, list, now, typed, listId, pinnedIds]);
}

/** One empty history, so "not loaded yet" doesn't hand memos a new array every render */
const NO_HISTORY: BoughtItem[] = [];

/**
 * "Now", read again each time the app comes back to the foreground, so a badge counted yesterday
 * doesn't stay stale on a phone that kept the app open overnight.
 */
function useNowSinceForeground(): Temporal.Instant {
  const [now, setNow] = useState(() => Temporal.Now.instant());
  useEffect(() => {
    const refresh = () => {
      if (document.visibilityState === "visible") setNow(Temporal.Now.instant());
    };
    document.addEventListener("visibilitychange", refresh);
    return () => document.removeEventListener("visibilitychange", refresh);
  }, []);
  return now;
}

/** Number of past buys stored for the household, for deciding whether to show Buy again triggers */
export function useBuyAgainHistoryCount(): number {
  const history = useQuery(historyQuery()).data ?? NO_HISTORY;
  return history.length;
}

/**
 * Exact count of un-added "Running low" items for a list—the same definition the Buy again sheet
 * uses for its "Add N due" button, so the dock badge and sheet always agree.
 */
export function useBuyAgainDueCount(listId: string | undefined): number {
  const history = useQuery(historyQuery()).data ?? NO_HISTORY;
  const { data: list } = useQuery({ ...listQuery(listId ?? ""), enabled: listId !== undefined });
  const now = useNowSinceForeground();
  return useMemo(() => {
    const allOpen = list?.items.filter((item) => !item.checked).map((item) => item.name) ?? [];
    const checkedOnList = list?.items.filter((item) => item.checked).map((item) => item.name) ?? [];
    return browseBuyAgain(history, {
      now,
      listId,
      onList: allOpen,
      inBasket: allOpen,
      checkedOnList,
    }).due.filter((item) => !item.onList && !item.checked).length;
  }, [history, list, now, listId]);
}

/** Full purchase history organized into "Running low" and aisle sections for the Buy again sheet */
export function useBuyAgainCatalog(
  listId: string | undefined,
  {
    query = "",
    includeOtherLists = false,
    now,
    stickyDueOrder,
  }: {
    query?: string;
    includeOtherLists?: boolean;
    now: Temporal.Instant;
    stickyDueOrder?: readonly string[];
  },
): BuyAgainCatalog {
  const history = useQuery(historyQuery()).data ?? NO_HISTORY;
  const { data: list } = useQuery({ ...listQuery(listId ?? ""), enabled: listId !== undefined });
  return useMemo(() => {
    const allOpen = list?.items.filter((item) => !item.checked).map((item) => item.name) ?? [];
    const checkedOnList = list?.items.filter((item) => item.checked).map((item) => item.name) ?? [];
    return browseBuyAgain(history, {
      now,
      listId,
      query,
      includeOtherLists,
      onList: allOpen,
      inBasket: allOpen,
      checkedOnList,
      stickyDueOrder,
    });
  }, [history, list, now, listId, query, includeOtherLists, stickyDueOrder]);
}

function adjustListCounts(
  queryClient: QueryClient,
  listId: string,
  delta: { itemCount: number; openCount: number },
) {
  queryClient.setQueryData(listsQuery().queryKey, (lists: ShoppingListSummary[] | undefined) =>
    lists?.map((list) =>
      list.id === listId
        ? {
            ...list,
            itemCount: Math.max(0, list.itemCount + delta.itemCount),
            openCount: Math.max(0, list.openCount + delta.openCount),
          }
        : list,
    ),
  );
}

/** Only what the list shows about a person, since a change is saved on the device with its variables */
function person({ id, name }: PersonSummary): PersonSummary {
  return { id, name };
}

function cleared(count: number): string {
  return count === 1 ? "Cleared 1 ticked item" : `Cleared ${count} ticked items`;
}

/** "Bananas, Lemons, Oat milk and 2 more" */
export function namesOf(names: string[], shown = 3): string {
  if (names.length <= shown) return names.join(", ");
  return `${names.slice(0, shown).join(", ")} and ${names.length - shown} more`;
}
