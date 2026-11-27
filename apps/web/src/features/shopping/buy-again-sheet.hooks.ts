import { useEffect, useEffectEvent, useRef, useState, type RefObject } from "react";

import type { PersonSummary } from "@/lib/shared-with.ts";

import type { BuyAgainCatalogItem, BuyAgainFor } from "./buy-again.ts";
import { itemKey, type Entry } from "./item-entry.ts";
import { stepQuantity } from "./item-quantity.ts";
import type { Outcome } from "./list-entry.ts";
import { useListEntry } from "./list-entry.hooks.ts";
import type { ShoppingItem, ShoppingList } from "./shopping.api.ts";
import { useEditItem } from "./shopping.hooks.ts";

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
export function useStickyRunningLowOrder(listId: string, buyAgain: BuyAgainFor) {
  const [stickyRunningLow, setStickyRunningLow] = useState<{
    listId: string;
    order: string[];
    /** Everything running low was already on the list when the sheet opened */
    allOnList: boolean;
  } | null>(null);
  const [runningLowExpanded, setRunningLowExpanded] = useState(false);

  if (buyAgain.loaded && stickyRunningLow?.listId !== listId) {
    const initial = buyAgain.browse();
    // What's still to add leads; rows already on the list go last (and stay put after that)
    const order = [
      ...initial.runningLow.filter((item) => !item.onList),
      ...initial.runningLow.filter((item) => item.onList),
    ].map((item) => itemKey(item.name));
    setStickyRunningLow({
      listId,
      order,
      allOnList: initial.runningLow.length > 0 && initial.runningLow.every((item) => item.onList),
    });
    setRunningLowExpanded(false);
  }

  const matched = stickyRunningLow?.listId === listId ? stickyRunningLow : null;
  return {
    stickyRunningLowOrder: matched?.order,
    allRunningLowInitiallyOnList: matched?.allOnList ?? false,
    runningLowExpanded,
    expandRunningLow: () => setRunningLowExpanded(true),
  };
}

/** What the sheet says out loud after putting something on the list, or taking it back */
function said(outcome: Outcome, listName: string): string | null {
  switch (outcome.kind) {
    case "added":
      return `Added ${outcome.quantity ? `${outcome.quantity} ` : ""}${outcome.name} to ${listName}`;
    case "unticked":
      return `${outcome.item.name} is back on ${listName}`;
    case "amount-set":
      return `${outcome.item.name} set to ${outcome.amount}`;
    case "already-there":
      return `${outcome.item.name} is already on ${listName}`;
    case "taken-off":
      return `Took ${outcome.name} off ${listName}`;
    case "ticked-again":
      return `${outcome.item.name} ticked off again`;
    default:
      return null;
  }
}

/**
 * Session actions inside the Buy again sheet: toggling past buys on/off the list, stepping
 * quantities, bulk-adding everything running low with in-place Undo, and quick-adding a typed
 * entry with a transient Undo bar. What a tap means is list-entry.ts's; this decides what the
 * sheet shows and says about it.
 */
export function useBuyAgainSession({
  listId,
  listName,
  viewer,
  list,
  runningLowToAdd,
  undoBarRef,
  onAnnounce,
  onFlashHint,
  onClearQuery,
  onPut,
  rescueFocusFrom,
  rescueLostFocus,
}: {
  listId: string;
  listName: string;
  viewer: PersonSummary;
  list: ShoppingList | undefined;
  runningLowToAdd: readonly BuyAgainCatalogItem[];
  undoBarRef: RefObject<HTMLDivElement | null>;
  onAnnounce: (message: string) => void;
  onFlashHint: (key: string, name: string) => void;
  onClearQuery: () => void;
  /** What this session put on the list, so closing the sheet can offer to take it all back */
  onPut: (outcomes: readonly Outcome[]) => void;
  rescueFocusFrom: (element: Element | null | undefined) => void;
  rescueLostFocus: () => void;
}) {
  // In-sheet undo banner for bulk "Add all N" (stays inside focus trap, never collides with toasts)
  const [bulkUndo, setBulkUndo] = useState<BulkUndo | null>(null);
  const bulkTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  // After adding something new from the filter, which has no row to show it: "Added x · Undo"
  const [undoBar, setUndoBar] = useState<UndoBar | null>(null);
  const [lastUndoBar, setLastUndoBar] = useState<UndoBar | null>(null);
  const undoBarTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const entry = useListEntry(listId, viewer);
  const edit = useEditItem(listId);

  useEffect(
    () => () => {
      clearTimeout(bulkTimerRef.current);
      clearTimeout(undoBarTimerRef.current);
    },
    [],
  );

  // Once undone items are back, "Add all N" stands on its own again
  if (bulkUndo?.undone && runningLowToAdd.length >= 2) {
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

  /** Says what happened, and passes on what can be taken back when the sheet closes */
  function report(outcome: Outcome) {
    const message = said(outcome, listName);
    if (message) onAnnounce(message);
    onPut([outcome]);
  }

  function toggleRow(row: BuyAgainCatalogItem, typedQuantity?: string | null) {
    if (!list) return;
    dismissBulkUndo();
    const was = entry.status(row.name);
    // A second tap takes back what this session did; a typed amount ("3 milk") always means
    // "make it 3", never "take it off"
    const outcome =
      was === "unticked" || (was === "added" && !typedQuantity)
        ? entry.takeBack(row.name)
        : entry.put(
            { name: row.name, quantity: typedQuantity ?? null },
            { onClash: "settle", usualQuantity: row.quantity },
          );
    if (!outcome) return;
    if (outcome.kind === "already-there") {
      // Already on the list before this sheet opened (possibly a housemate's): never delete on a
      // stray tap
      onFlashHint(itemKey(row.name), outcome.item.name);
      return;
    }
    report(outcome);
  }

  function addAllRunningLow() {
    if (!list || runningLowToAdd.length === 0) return;
    const all = entry.putAll(runningLowToAdd);
    if (all.count === 0) return;
    onPut(all.outcomes);

    clearTimeout(bulkTimerRef.current);
    // The "Add all N" button turns into Undo where it is, so focus and thumb stay put
    setBulkUndo({
      count: all.count,
      undo: () => {
        const taken = all.undo();
        onAnnounce(`Took ${taken} back off ${listName}`);
        // The items come back a moment later; until then the button stays, showing "Add all N",
        // so it never unmounts under the focus that pressed it
        clearTimeout(bulkTimerRef.current);
        setBulkUndo((prev) => prev && { ...prev, undone: true });
        // Fallback if they never come back (e.g. a housemate added them meanwhile); never
        // clears a newer "Add all N" press
        bulkTimerRef.current = setTimeout(() => {
          setBulkUndo((prev) => (prev?.undone ? null : prev));
          rescueLostFocus();
        }, 1_000);
      },
    });
    onAnnounce(`Added ${all.count} to ${listName}. Press the same button again to undo`);
    bulkTimerRef.current = setTimeout(() => {
      setBulkUndo(null);
      // If nothing's left to add, the button goes with it
      rescueLostFocus();
    }, BULK_UNDO_MS);
  }

  function quickAddParsed(parsedQuery: Entry | null) {
    if (!list || !parsedQuery?.name) return;
    const outcome = entry.put(parsedQuery, { onClash: "settle" });
    report(outcome);
    if (outcome.kind === "added") {
      // A new item has no row here yet, so say so where you can see it, with a way back
      showUndoBar({
        message: said(outcome, listName) ?? "",
        undo: () => {
          entry.undo([outcome]);
          onAnnounce(`Took ${outcome.name} off ${listName}`);
          hideUndoBar();
        },
      });
    }
    onClearQuery();
  }

  function stepRowQuantity(item: ShoppingItem, delta: 1 | -1) {
    const next = stepQuantity(item.quantity ?? "", delta);
    if (next === null) return;
    edit(item.id, { quantity: next || null });
  }

  return {
    statusOf: entry.status,
    bulkUndo,
    bulkUndoActive,
    undoBar,
    lastUndoBar,
    toggleRow,
    addAllRunningLow,
    quickAddParsed,
    stepRowQuantity,
  };
}
