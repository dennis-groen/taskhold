import { useEffect, useEffectEvent, useRef, useState, type RefObject } from "react";

import type { PersonSummary } from "@/lib/shared-with.ts";

import { browseBuyAgain, type BuyAgainCatalogItem } from "./buy-again.ts";
import { findOnList, itemKey, type Entry } from "./item-entry.ts";
import { stepQuantity } from "./item-quantity.ts";
import type { BoughtItem, ShoppingItem, ShoppingList } from "./shopping.api.ts";
import {
  useAddItem,
  useBuyAgainState,
  useEditItem,
  useToggleItem,
  useUndoAddItem,
} from "./shopping.hooks.ts";

/** How long an inline "Hidden · Undo" row stays before committing forgetHistory */
const HIDE_UNDO_MS = 5_000;
/** How long the in-sheet bulk-add undo bar stays visible */
const BULK_UNDO_MS = 6_000;
/** How long a hidden row takes to fold away; matches the row's grid-rows transition */
const COLLAPSE_MS = 200;

/** Runs once React has painted, e.g. to move focus onto something it just rendered */
export function afterPaint(fn: () => void) {
  requestAnimationFrame(() => requestAnimationFrame(fn));
}

export type BulkUndo = {
  count: number;
  undo: () => void;
  /** Undo was pressed and the items are on their way back: keep the button (and its focus) */
  undone?: boolean;
};

/** The bar under the list after adding something new from the filter: what happened, and Undo */
export type UndoBar = {
  message: string;
  undo: () => void;
};

type PendingHide = {
  name: string;
  variants: string[];
  timer: ReturnType<typeof setTimeout>;
};

/**
 * Holds a transient value for `durationMs` (e.g. a row flash, inline hint, or typing cue) and
 * clears its timer on unmount.
 */
export function useTimedValue<T>(durationMs: number): {
  value: T | null;
  show: (next: T) => void;
  clear: () => void;
} {
  const [value, setValue] = useState<T | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => () => clearTimeout(timerRef.current), []);

  function show(next: T) {
    setValue(next);
    clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => setValue(null), durationMs);
  }

  function clear() {
    clearTimeout(timerRef.current);
    setValue(null);
  }

  return { value, show, clear };
}

/**
 * Edit-mode hide queue for Buy again: shows an inline "Hidden · Undo" strip for a few seconds,
 * folds the row away, and only then forgets the item on the server. Flushes pending hides when
 * leaving Edit mode, closing the sheet, or hiding/closing the page.
 */
export function usePendingHides({
  forget,
  rescueFocusFromRow,
  focusRow,
  onAnnounce,
  registerCommitPendingHides,
}: {
  forget: (names: string[]) => void;
  rescueFocusFromRow: (key: string) => void;
  focusRow: (key: string, selector: string) => void;
  onAnnounce: (message: string) => void;
  registerCommitPendingHides: (fn: () => void) => void;
}) {
  const [pendingHides, setPendingHides] = useState<Record<string, PendingHide>>({});
  const pendingHidesRef = useRef<Record<string, PendingHide>>({});
  // Committed hides collapse over 200ms; only then is the item forgotten, which removes the row
  const [collapsingHides, setCollapsingHides] = useState<Record<string, true>>({});
  const collapseTimersRef = useRef<
    Record<string, { variants: string[]; timer: ReturnType<typeof setTimeout> }>
  >({});

  /** Forget a collapsing row now and drop its collapse flag, so a rolled-back hide comes back visible */
  function finishCollapse(key: string) {
    const collapse = collapseTimersRef.current[key];
    if (!collapse) return;
    clearTimeout(collapse.timer);
    delete collapseTimersRef.current[key];
    forget(collapse.variants);
    setCollapsingHides((prev) => {
      const next = { ...prev };
      delete next[key];
      return next;
    });
  }

  /** Commit one hide: fold the row away, then forget the item once the fold has played */
  function commitHide(key: string) {
    const pending = pendingHidesRef.current[key];
    if (!pending) return;
    clearTimeout(pending.timer);
    const next = { ...pendingHidesRef.current };
    delete next[key];
    pendingHidesRef.current = next;
    rescueFocusFromRow(key);
    setPendingHides(next);
    setCollapsingHides((prev) => ({ ...prev, [key]: true }));
    collapseTimersRef.current[key] = {
      variants: pending.variants,
      timer: setTimeout(() => finishCollapse(key), COLLAPSE_MS),
    };
  }

  /** Commit every pending hide and finish every fold straight away (closing, leaving the page) */
  function commitAllPendingHides() {
    const entries = Object.entries(pendingHidesRef.current);
    pendingHidesRef.current = {};
    if (entries.length > 0) setPendingHides({});
    for (const [, pending] of entries) {
      clearTimeout(pending.timer);
      forget(pending.variants);
    }
    for (const key of Object.keys(collapseTimersRef.current)) finishCollapse(key);
  }

  // The once-per-session listeners below always reach the latest commit
  const commitAllLatest = useEffectEvent(() => commitAllPendingHides());

  // Hides commit only from their timer, Done in Edit mode, closing the sheet, or the page going
  // away. Registered once, so re-renders (the keyboard moving, refetches) never cut an Undo short.
  useEffect(() => {
    const commitAll = () => commitAllLatest();
    const commitWhenHidden = () => {
      // iOS often skips pagehide when a home-screen app is swiped away
      if (document.visibilityState === "hidden") commitAll();
    };
    registerCommitPendingHides(commitAll);
    window.addEventListener("pagehide", commitAll);
    document.addEventListener("visibilitychange", commitWhenHidden);
    return () => {
      window.removeEventListener("pagehide", commitAll);
      document.removeEventListener("visibilitychange", commitWhenHidden);
      commitAll();
    };
  }, [registerCommitPendingHides]);

  function scheduleHide(entry: BuyAgainCatalogItem) {
    const key = itemKey(entry.name);
    const existing = pendingHidesRef.current[key];
    if (existing) clearTimeout(existing.timer);
    const timer = setTimeout(() => commitHide(key), HIDE_UNDO_MS);
    const next = {
      ...pendingHidesRef.current,
      [key]: { name: entry.name, variants: entry.variants, timer },
    };
    pendingHidesRef.current = next;
    setPendingHides(next);
    onAnnounce(`${entry.name} hidden from Buy again. Undo is there for a few seconds`);
    focusRow(key, "button");
  }

  function undoHide(key: string) {
    const pending = pendingHidesRef.current[key];
    if (!pending) return;
    clearTimeout(pending.timer);
    const next = { ...pendingHidesRef.current };
    delete next[key];
    pendingHidesRef.current = next;
    setPendingHides(next);
    onAnnounce(`${pending.name} is back in Buy again`);
    focusRow(key, 'button[aria-label^="Hide"]');
  }

  return {
    pendingHides,
    collapsingHides,
    scheduleHide,
    undoHide,
    commitAllPendingHides,
  };
}

/**
 * Freezes which items belong in "Running low" once the list and history are loaded, so tapping
 * an item never moves it or its paired items between "Running low" and the aisle cards mid-session.
 */
export function useStickyDueOrder(
  listId: string,
  list: ShoppingList | undefined,
  history: BoughtItem[],
  now: Temporal.Instant,
) {
  const [stickyDue, setStickyDue] = useState<{
    listId: string;
    order: string[];
    /** Everything running low was already on the list when the sheet opened */
    allOnList: boolean;
  } | null>(null);
  const [dueExpanded, setDueExpanded] = useState(false);

  if (list !== undefined && history.length > 0 && stickyDue?.listId !== listId) {
    const initialOpen = list.items.filter((item) => !item.checked).map((item) => item.name);
    const initialChecked = list.items.filter((item) => item.checked).map((item) => item.name);
    const initial = browseBuyAgain(history, {
      now,
      listId,
      onList: initialOpen,
      inBasket: initialOpen,
      checkedOnList: initialChecked,
    });
    // What's still to add leads; rows already on the list go last (and stay put after that)
    const order = [
      ...initial.due.filter((item) => !item.onList),
      ...initial.due.filter((item) => item.onList),
    ].map((item) => itemKey(item.name));
    setStickyDue({
      listId,
      order,
      allOnList: initial.due.length > 0 && initial.due.every((item) => item.onList),
    });
    setDueExpanded(false);
  }

  const matched = stickyDue?.listId === listId ? stickyDue : null;
  return {
    stickyDueOrder: matched?.order,
    allDueInitiallyOnList: matched?.allOnList ?? false,
    dueExpanded,
    expandDue: () => setDueExpanded(true),
  };
}

/**
 * Session actions inside the Buy again sheet: toggling past buys on/off the list, stepping
 * quantities, bulk-adding all "Running low" items with in-place Undo, and quick-adding a typed
 * entry with a transient Undo bar.
 */
export function useBuyAgainSession({
  listId,
  listName,
  viewer,
  list,
  unaddedDue,
  undoBarRef,
  onAnnounce,
  onFlashHint,
  onClearQuery,
  rescueFocusFrom,
  rescueLostFocus,
}: {
  listId: string;
  listName: string;
  viewer: PersonSummary;
  list: ShoppingList | undefined;
  unaddedDue: readonly BuyAgainCatalogItem[];
  undoBarRef: RefObject<HTMLDivElement | null>;
  onAnnounce: (message: string) => void;
  onFlashHint: (key: string, name: string) => void;
  onClearQuery: () => void;
  rescueFocusFrom: (element: Element | null | undefined) => void;
  rescueLostFocus: () => void;
}) {
  // Track items unticked during this session (with original checker) so a second tap re-ticks cleanly
  const [untickedByKey, setUntickedByKey] = useState<
    Record<string, { id: string; checkedBy: PersonSummary | null }>
  >({});
  // In-sheet undo banner for bulk "Add N due" (stays inside focus trap, never collides with toasts)
  const [bulkUndo, setBulkUndo] = useState<BulkUndo | null>(null);
  const bulkTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  // After adding something new from the filter, which has no row to show it: "Added x · Undo"
  const [undoBar, setUndoBar] = useState<UndoBar | null>(null);
  const [lastUndoBar, setLastUndoBar] = useState<UndoBar | null>(null);
  const undoBarTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const add = useAddItem(viewer);
  const undoAdd = useUndoAddItem();
  const edit = useEditItem(listId);
  const toggle = useToggleItem(listId, viewer);
  const { addedIdFor, markAdded, clearAdded, pinnedIds } = useBuyAgainState(listId);

  useEffect(
    () => () => {
      clearTimeout(bulkTimerRef.current);
      clearTimeout(undoBarTimerRef.current);
    },
    [],
  );

  // Once undone items are back, "Add N due" stands on its own again
  if (bulkUndo?.undone && unaddedDue.length >= 2) {
    setBulkUndo(null);
  }
  const bulkUndoActive = bulkUndo !== null && !bulkUndo.undone;

  function showUndoBar(bar: UndoBar) {
    clearTimeout(undoBarTimerRef.current);
    setUndoBar(bar);
    setLastUndoBar(bar);
    undoBarTimerRef.current = setTimeout(() => {
      rescueFocusFrom(undoBarRef.current);
      setUndoBar(null);
    }, BULK_UNDO_MS);
  }

  function hideUndoBar() {
    clearTimeout(undoBarTimerRef.current);
    rescueFocusFrom(undoBarRef.current);
    setUndoBar(null);
  }

  function dismissBulkUndo() {
    clearTimeout(bulkTimerRef.current);
    setBulkUndo(null);
  }

  function toggleRow(entry: BuyAgainCatalogItem, overrideQuantity?: string | null) {
    if (!list) return;
    dismissBulkUndo();
    const key = itemKey(entry.name);
    const existing = findOnList(list.items, entry.name);
    if (existing) {
      if (existing.checked) {
        toggle(existing.id, false);
        if (overrideQuantity && overrideQuantity !== existing.quantity) {
          edit(existing.id, { quantity: overrideQuantity });
        }
        setUntickedByKey((prev) => ({
          ...prev,
          [key]: { id: existing.id, checkedBy: existing.checkedBy },
        }));
        onAnnounce(`${existing.name} is back on ${listName}`);
      } else if (untickedByKey[key]?.id === existing.id) {
        // Second tap on an item unticked in this session ticks it back off with its original ticker
        const original = untickedByKey[key];
        toggle(existing.id, true, original.checkedBy ?? viewer);
        setUntickedByKey((prev) => {
          const next = { ...prev };
          delete next[key];
          return next;
        });
        onAnnounce(`${existing.name} ticked off again`);
      } else if (overrideQuantity) {
        // A typed amount ("3 milk") always means "make it 3", never "take it off"
        if (overrideQuantity !== existing.quantity) {
          edit(existing.id, { quantity: overrideQuantity });
          onAnnounce(`${existing.name} set to ${overrideQuantity}`);
        } else {
          onFlashHint(key, existing.name);
        }
      } else if (addedIdFor(entry.name) === existing.id) {
        // Added in this session: tapping again takes it back off
        clearAdded(entry.name);
        undoAdd(listId, existing.id);
        onAnnounce(`Took ${existing.name} off ${listName}`);
      } else {
        // Already on the list before this sheet opened (possibly a housemate's): never delete on stray tap
        onFlashHint(key, existing.name);
      }
      return;
    }
    const quantity = overrideQuantity ?? entry.quantity;
    const id = add(listId, entry.name, quantity);
    markAdded(entry.name, id);
    onAnnounce(`Added ${quantity ? `${quantity} ` : ""}${entry.name} to ${listName}`);
  }

  function addAllDue() {
    if (!list || unaddedDue.length === 0) return;
    const added: { name: string; id: string }[] = [];
    const unticked: { key: string; id: string; checkedBy: PersonSummary | null }[] = [];
    for (const entry of unaddedDue) {
      const existing = findOnList(list.items, entry.name);
      if (existing) {
        if (existing.checked) {
          toggle(existing.id, false);
          unticked.push({
            key: itemKey(entry.name),
            id: existing.id,
            checkedBy: existing.checkedBy,
          });
        }
      } else {
        const id = add(listId, entry.name, entry.quantity);
        markAdded(entry.name, id);
        added.push({ name: entry.name, id });
      }
    }
    if (unticked.length > 0) {
      setUntickedByKey((prev) => {
        const next = { ...prev };
        for (const item of unticked) {
          next[item.key] = { id: item.id, checkedBy: item.checkedBy };
        }
        return next;
      });
    }
    const count = added.length + unticked.length;
    if (count === 0) return;

    clearTimeout(bulkTimerRef.current);
    // The "Add N due" button turns into Undo where it is, so focus and thumb stay put
    setBulkUndo({
      count,
      undo: () => {
        for (const item of added) {
          clearAdded(item.name);
          undoAdd(listId, item.id);
        }
        for (const item of unticked) {
          toggle(item.id, true, item.checkedBy ?? viewer);
        }
        onAnnounce(`Took ${count} back off ${listName}`);
        // The items come back a moment later; until then the button stays, showing "Add N due",
        // so it never unmounts under the focus that pressed it
        clearTimeout(bulkTimerRef.current);
        setBulkUndo((prev) => prev && { ...prev, undone: true });
        // Fallback if they never come back (e.g. a housemate added them meanwhile); never
        // clears a newer "Add N due" press
        bulkTimerRef.current = setTimeout(() => {
          setBulkUndo((prev) => (prev?.undone ? null : prev));
          rescueLostFocus();
        }, 1_000);
      },
    });
    onAnnounce(`Added ${count} to ${listName}. Press the same button again to undo`);
    bulkTimerRef.current = setTimeout(() => {
      setBulkUndo(null);
      // If nothing's left to add, the button goes with it
      rescueLostFocus();
    }, BULK_UNDO_MS);
  }

  function quickAddParsed(parsedQuery: Entry | null) {
    if (!list || !parsedQuery?.name) return;
    const existing = findOnList(list.items, parsedQuery.name);
    if (existing) {
      if (existing.checked) {
        toggle(existing.id, false);
        if (parsedQuery.quantity && parsedQuery.quantity !== existing.quantity) {
          edit(existing.id, { quantity: parsedQuery.quantity });
        }
        const existingKey = itemKey(existing.name);
        setUntickedByKey((prev) => ({
          ...prev,
          [existingKey]: { id: existing.id, checkedBy: existing.checkedBy },
        }));
        onAnnounce(`${existing.name} is back on ${listName}`);
      } else if (parsedQuery.quantity && parsedQuery.quantity !== existing.quantity) {
        edit(existing.id, { quantity: parsedQuery.quantity });
        onAnnounce(`${existing.name} set to ${parsedQuery.quantity}`);
      } else {
        onAnnounce(`${existing.name} is already on ${listName}`);
      }
      onClearQuery();
      return;
    }
    const { name, quantity } = parsedQuery;
    const id = add(listId, name, quantity);
    markAdded(name, id);
    const message = `Added ${quantity ? `${quantity} ` : ""}${name} to ${listName}`;
    onAnnounce(message);
    // A new item has no row here yet, so say so where you can see it, with a way back
    showUndoBar({
      message,
      undo: () => {
        clearAdded(name);
        undoAdd(listId, id);
        onAnnounce(`Took ${name} off ${listName}`);
        hideUndoBar();
      },
    });
    onClearQuery();
  }

  function stepRowQuantity(item: ShoppingItem, delta: 1 | -1) {
    const next = stepQuantity(item.quantity ?? "", delta);
    if (next === null) return;
    edit(item.id, { quantity: next || null });
  }

  return {
    addedCount: pinnedIds.size,
    addedIdFor,
    untickedByKey,
    bulkUndo,
    bulkUndoActive,
    undoBar,
    lastUndoBar,
    toggleRow,
    addAllDue,
    quickAddParsed,
    stepRowQuantity,
  };
}
