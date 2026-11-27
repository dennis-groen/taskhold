import { onlineManager, useQuery, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { changeFailed, inform } from "@/lib/feedback.ts";
import { useChange, useWaitingVars } from "@/lib/offline-changes.ts";
import { firstName, type PersonSummary } from "@/lib/shared-with.ts";

import {
  endTrip,
  startTrip,
  type BoughtItem,
  type ShoppingList,
  type ShoppingTrip,
} from "./shopping.api.ts";
import { tripStartFailure } from "./shopping-trip.ts";
import { shoppingChanges, type ItemChanges } from "./shopping.changes.ts";
import { buyAgainFor, type BuyAgainFor } from "./buy-again.ts";
import { historyQuery, isListGone, listQuery } from "./shopping.queries.ts";

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
          inform(
            `${firstName(started.shopper.name)} is already out shopping`,
            "They'll tick things off as they go.",
          );
        }
      } catch (err) {
        changeFailed(err, tripStartFailure(err));
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
  const createList = useChange(shoppingChanges.createList);
  const renameList = useChange(shoppingChanges.renameList);
  const deleteList = useChange(shoppingChanges.deleteList);

  return {
    /** Returns the new list's id, so it can be opened straight away */
    create: (name: string) => {
      const id = crypto.randomUUID();
      createList.run({ id, name });
      return id;
    },
    rename: (listId: string, name: string) => {
      renameList.run({ listId, name });
    },
    /** Call once the list's page has been left, so it doesn't look for a list that's gone */
    remove: (listId: string) => {
      deleteList.run({ listId });
    },
  };
}

/** Changes an item's name or quantity on any list; leave a field out to keep it */
export function useEditItem(listId: string | undefined) {
  const edit = useChange(shoppingChanges.edit);
  return (itemId: string, changes: ItemChanges) => {
    if (listId) edit.run({ listId, itemId, changes });
  };
}

/** Item ids whose ticks are saved on this device and still waiting to reach the server */
export function usePendingToggleIds(): Set<string> {
  return new Set(useWaitingVars(shoppingChanges.toggle).map((vars) => vars.itemId));
}

/** Removes an item (and its merged spellings) from Buy again history on the server */
export function useForgetBuyAgain() {
  const forget = useChange(shoppingChanges.forgetHistory);
  return (names: string[]) => {
    if (names.length > 0) forget.run({ names });
  };
}

/**
 * Buy again for a list (see buyAgainFor), judged at `now`: leave it out to judge it once per screen,
 * so chips don't reshuffle while someone is picking. Nothing until the history has loaded.
 */
export function useBuyAgainFor(listId: string | undefined, now?: Temporal.Instant): BuyAgainFor {
  const history = useQuery(historyQuery()).data ?? NO_HISTORY;
  const { data: list } = useQuery({ ...listQuery(listId ?? ""), enabled: listId !== undefined });
  const [screenNow] = useState(() => Temporal.Now.instant());
  const at = now ?? screenNow;
  return useMemo(() => buyAgainFor(history, list, listId, at), [history, list, listId, at]);
}

/** One empty history, so "not loaded yet" doesn't hand memos a new array every render */
const NO_HISTORY: BoughtItem[] = [];

/**
 * "Now", read again each time the app comes back to the foreground, so a badge counted yesterday
 * doesn't stay stale on a phone that kept the app open overnight.
 */
export function useNowSinceForeground(): Temporal.Instant {
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
