// oxlint-disable max-lines -- tracked for split into subcomponents
import { useQuery } from "@tanstack/react-query";
import {
  useCallback,
  useDeferredValue,
  useEffect,
  useEffectEvent,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type FormEvent,
  type KeyboardEvent,
  type ReactNode,
  type RefObject,
} from "react";

import {
  ArrowCounterClockwiseIcon,
  CaretDownIcon,
  CheckIcon,
  ClockCounterClockwiseIcon,
  ClockIcon,
  MagnifyingGlassIcon,
  MinusCircleIcon,
  MinusIcon,
  PlusIcon,
  XIcon,
} from "@/components/icons.ts";
import { SheetContent, SheetEyebrow } from "@/components/layout/Sheet.tsx";
import { Button } from "@/components/ui/button";
import { Drawer, DrawerClose, DrawerDescription, DrawerTitle } from "@/components/ui/drawer";
import { firstName } from "@/lib/shared-with.ts";
import { cn } from "cn";

import {
  browseBuyAgain,
  filterEnterTarget,
  lastBoughtCue,
  type BuyAgainCatalogItem,
} from "../buy-again.ts";
import { categorize } from "../categories.ts";
import { CATEGORY_ICONS } from "../category-icons.ts";
import { findOnList, itemKey, parseEntry } from "../item-entry.ts";
import { stepQuantity } from "../item-quantity.ts";
import type { BoughtItem, ShoppingItem } from "../shopping.api.ts";
import {
  useAddItem,
  useBuyAgainCatalog,
  useBuyAgainState,
  useEditItem,
  useForgetBuyAgain,
  useToggleItem,
  useUndoAddItem,
} from "../shopping.hooks.ts";
import { historyQuery, listQuery } from "../shopping.queries.ts";

type Viewer = { id: string; name: string };
type Person = { id: string; name: string };

/** How long an inline "Hidden · Undo" row stays before committing forgetHistory */
const HIDE_UNDO_MS = 5_000;
/** How long the in-sheet bulk-add undo bar stays visible */
const BULK_UNDO_MS = 6_000;
/** How long a hidden row takes to fold away; matches the row's grid-rows transition */
const COLLAPSE_MS = 200;
/** Runs once React has painted, e.g. to move focus onto something it just rendered */
function afterPaint(fn: () => void) {
  requestAnimationFrame(() => requestAnimationFrame(fn));
}

/** One empty history, so "not loaded yet" doesn't hand memos a new array every render */
const NO_HISTORY: BoughtItem[] = [];

/**
 * A card in the sheet. Its border is drawn inside it, over the rows (`after:`), so it lines up to the
 * pixel with the border of a pinned header, which has to sit inside the card's clipping.
 */
const SHEET_CARD =
  "relative overflow-clip rounded-[20px] bg-card after:pointer-events-none after:absolute after:inset-0 after:z-[5] after:rounded-[inherit] after:border after:border-border";

/** The card-coloured part of a pinned header: the card's rounded top, with the card's border */
const STICKY_CARD_HEAD_INNER =
  "flex min-h-12 items-center justify-between rounded-t-[20px] border border-b-0 border-border bg-card px-4 py-2";

/**
 * A card's header that pins to the top of the sheet's scroll area, so you always know which aisle
 * you're in. It keeps the card's rounded top while pinned: this outer layer is the sheet's colour, so
 * the corners outside the rounding show the sheet and never the rows sliding underneath. At rest
 * that layer's corners fall outside the card's rounded clipping and don't show.
 *
 * Its `before:` cap reaches a little above it: when the sheet sits at a fractional pixel, the pinned
 * header and the scroll area's edge round differently and a sliver of the row above would peek
 * out. A hairline under it shows only while it's pinned (`sticky-card-head` in globals.css).
 */
function StickyCardHead({ children }: { children: ReactNode }) {
  return (
    <div className="sticky-card-head sticky top-0 z-10 bg-canvas before:pointer-events-none before:absolute before:inset-x-0 before:bottom-full before:h-3 before:bg-canvas">
      {children}
      <span
        aria-hidden
        className="sticky-card-rule pointer-events-none absolute inset-x-0 -bottom-px h-px bg-border"
      />
    </div>
  );
}

/**
 * Full "Buy again" restock sheet: "Running low" regulars and basket-paired items at the top,
 * followed by every past buy grouped by supermarket aisle in cards matching the list page.
 *
 * Tap any row to add it (or take back something added in this session), adjust amounts inline
 * with 44px steppers, or switch into Edit mode to hide old items with inline Undo.
 */
export function BuyAgainSheet({
  open,
  onOpenChange,
  listId,
  listName,
  viewer,
  onSessionClose,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  listId: string;
  listName: string;
  viewer: Viewer;
  /** Called on close with how many items were added during this sheet session */
  onSessionClose?: (addedCount: number) => void;
}) {
  const bodyRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const addedCountRef = useRef(0);
  const commitPendingHidesRef = useRef<() => void>(() => {});
  // Keep content mounted until the drawer's exit animation finishes, and bump sessionId on each open
  const [session, setSession] = useState({ mounted: open, id: open ? 1 : 0, wasOpen: open });
  if (open && !session.wasOpen) {
    setSession({ mounted: true, id: session.id + 1, wasOpen: true });
  } else if (!open && session.wasOpen) {
    setSession((prev) => ({ ...prev, wasOpen: false }));
  }

  // Track iOS software keyboard lift so the sheet rises above the keyboard instead of shrinking under it
  const [keyboard, setKeyboard] = useState<{ offset: number; available: number } | null>(null);
  useEffect(() => {
    if (!session.mounted) return undefined;
    const vv = window.visualViewport;
    if (!vv) return undefined;
    const sync = () => {
      const kbOffset = Math.max(0, Math.round(window.innerHeight - vv.height - vv.offsetTop));
      const keyboardUp = window.innerHeight - vv.height > 100;
      const next = keyboardUp
        ? { offset: kbOffset, available: Math.max(220, Math.floor(vv.height - 32)) }
        : null;
      // visualViewport fires on every pan; only re-render when the lift actually changes
      setKeyboard((prev) =>
        prev?.offset === next?.offset && prev?.available === next?.available ? prev : next,
      );
    };
    sync();
    vv.addEventListener("resize", sync);
    vv.addEventListener("scroll", sync);
    return () => {
      vv.removeEventListener("resize", sync);
      vv.removeEventListener("scroll", sync);
    };
  }, [session.mounted]);

  // Stable identities, so the content's registration effect runs once per session. If it re-ran,
  // its cleanup would commit pending hides and cut their Undo short.
  const handleAddedCountChange = useCallback((count: number) => {
    addedCountRef.current = count;
  }, []);
  const registerCommitPendingHides = useCallback((fn: () => void) => {
    commitPendingHidesRef.current = fn;
  }, []);

  const sheetStyle: (CSSProperties & Record<`--${string}`, string>) | undefined = keyboard
    ? {
        "--kb": `${keyboard.offset}px`,
        "--drawer-content-max-height": `${keyboard.available}px`,
      }
    : undefined;

  return (
    <Drawer
      open={open}
      onOpenChange={(nextOpen, eventDetails) => {
        if (
          !nextOpen &&
          eventDetails.reason === "outside-press" &&
          eventDetails.event.target instanceof Element &&
          eventDetails.event.target.closest("[data-sonner-toaster]")
        ) {
          eventDetails.cancel();
          return;
        }
        if (!nextOpen) {
          commitPendingHidesRef.current();
          if (addedCountRef.current > 0) {
            onSessionClose?.(addedCountRef.current);
            addedCountRef.current = 0;
          }
        }
        onOpenChange(nextOpen);
      }}
      onOpenChangeComplete={(nextOpen) => {
        if (!nextOpen) {
          setSession((prev) => ({ ...prev, mounted: false }));
          setKeyboard(null);
        }
      }}
    >
      <SheetContent
        // On phones, keep the keyboard closed so you can rapid-tap straight away; on desktop,
        // land keyboard focus in the filter field (matching EditItemSheet).
        initialFocus={(type) => (type === "touch" ? bodyRef.current : searchRef.current)}
        style={sheetStyle}
        // Rise and settle with the keyboard instead of snapping (bottom and max-height follow --kb)
        className="bg-canvas transition-[transform,height,opacity,filter,bottom,max-height] after:bg-canvas [--drawer-content-max-height:min(86dvh,46rem)] data-[swipe-direction=down]:bottom-(--kb,0px) motion-reduce:transition-[transform,height,opacity,filter]"
      >
        {session.mounted && (
          <BuyAgainSheetContent
            key={`${listId}:${session.id}`}
            listId={listId}
            listName={listName}
            viewer={viewer}
            keyboardUp={keyboard !== null}
            bodyRef={bodyRef}
            searchRef={searchRef}
            onAddedCountChange={handleAddedCountChange}
            registerCommitPendingHides={registerCommitPendingHides}
          />
        )}
      </SheetContent>
    </Drawer>
  );
}

type PendingHide = {
  name: string;
  variants: string[];
  timer: ReturnType<typeof setTimeout>;
};

type BulkUndo = {
  count: number;
  undo: () => void;
  /** Undo was pressed and the items are on their way back: keep the button (and its focus) */
  undone?: boolean;
};

/** The bar under the list after adding something new from the filter: what happened, and Undo */
type UndoBar = {
  message: string;
  undo: () => void;
};

function BuyAgainSheetContent({
  listId,
  listName,
  viewer,
  keyboardUp,
  bodyRef,
  searchRef,
  onAddedCountChange,
  registerCommitPendingHides,
}: {
  listId: string;
  listName: string;
  viewer: Viewer;
  keyboardUp: boolean;
  bodyRef: RefObject<HTMLDivElement | null>;
  searchRef: RefObject<HTMLInputElement | null>;
  onAddedCountChange: (count: number) => void;
  registerCommitPendingHides: (fn: () => void) => void;
}) {
  const [query, setQuery] = useState("");
  const deferredQuery = useDeferredValue(query);
  const [includeOtherLists, setIncludeOtherLists] = useState(false);
  const [editing, setEditing] = useState(false);
  // Gate row animations until after first paint so arrival/filter never fires a burst of pops
  const [ready, setReady] = useState(false);
  // Track items unticked during this session (with original checker) so a second tap re-ticks cleanly
  const [untickedByKey, setUntickedByKey] = useState<
    Record<string, { id: string; checkedBy: Person | null }>
  >({});
  // Briefly highlight a pre-existing item's subtitle if tapped, instead of silently deleting it
  const [hintedKey, setHintedKey] = useState<string | null>(null);
  const hintTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  // Inline undo for Edit-mode hiding (stays inside the sheet's focus trap & survives refetches)
  const [pendingHides, setPendingHides] = useState<Record<string, PendingHide>>({});
  const pendingHidesRef = useRef<Record<string, PendingHide>>({});
  // Committed hides collapse over 200ms; only then is the item forgotten, which removes the row
  const [collapsingHides, setCollapsingHides] = useState<Record<string, true>>({});
  const collapseTimersRef = useRef<
    Record<string, { variants: string[]; timer: ReturnType<typeof setTimeout> }>
  >({});
  // In-sheet undo banner for bulk "Add N due" (stays inside focus trap, never collides with toasts).
  // The last one stays rendered while the banner folds away.
  const [bulkUndo, setBulkUndo] = useState<BulkUndo | null>(null);
  // After adding something new from the filter, which has no row to show it: "Added x · Undo"
  const [undoBar, setUndoBar] = useState<UndoBar | null>(null);
  const [lastUndoBar, setLastUndoBar] = useState<UndoBar | null>(null);
  const undoBarTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  // A short visible line under the filter when Enter can't tell which one you mean
  const [typingHint, setTypingHint] = useState<string | null>(null);
  const typingHintTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const bulkTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  // What the always-mounted live region says after each change, for screen readers
  const [announcement, setAnnouncement] = useState("");
  // The row Enter just changed, lit up once so you can see where it is
  const [freshKey, setFreshKey] = useState<string | null>(null);
  const freshTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const undoBarRef = useRef<HTMLDivElement>(null);
  // Capture the whole sheet's height (and its distance from the popup's top) before searching, so
  // filtering never makes it shrink under the user, even when the footer folds away for Edit
  const sheetRef = useRef<HTMLDivElement>(null);
  const [lockedSheet, setLockedSheet] = useState<{ height: number; top: number } | null>(null);
  // The search field has focus on a touch device: treat the keyboard as up even where
  // visualViewport can't tell (Android resizes the layout viewport along with it)
  const [touchTyping, setTouchTyping] = useState(false);
  // Freeze "now" once on open so relative cues and rankings never reshuffle mid-session
  const [now] = useState(() => Temporal.Now.instant());

  const { data: list } = useQuery(listQuery(listId));
  const history = useQuery(historyQuery()).data ?? NO_HISTORY;
  const add = useAddItem(viewer);
  const undoAdd = useUndoAddItem();
  const edit = useEditItem(listId);
  const forget = useForgetBuyAgain();
  const toggle = useToggleItem(listId, viewer);
  const { addedIdFor, markAdded, clearAdded, pinnedIds } = useBuyAgainState(listId);

  useEffect(() => {
    const id = requestAnimationFrame(() => setReady(true));
    return () => cancelAnimationFrame(id);
  }, []);

  useEffect(() => {
    onAddedCountChange(pinnedIds.size);
  }, [pinnedIds.size, onAddedCountChange]);

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
    rescueFocusFrom(rowElement(key));
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
      clearTimeout(hintTimerRef.current);
      clearTimeout(bulkTimerRef.current);
      clearTimeout(freshTimerRef.current);
      clearTimeout(undoBarTimerRef.current);
      clearTimeout(typingHintTimerRef.current);
    };
  }, [registerCommitPendingHides]);

  // Freeze which items belong in "Running low" once the list and history are loaded, so tapping
  // an item never moves it or its paired items between "Running low" and the aisle cards.
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

  const trimmedQuery = query.trim();
  const parsedQuery = trimmedQuery ? parseEntry(trimmedQuery) : null;
  const parsedDeferred = deferredQuery.trim() ? parseEntry(deferredQuery) : null;

  const catalog = useBuyAgainCatalog(listId, {
    query: parsedDeferred?.name ?? "",
    includeOtherLists,
    now,
    stickyDueOrder: stickyDue?.listId === listId ? stickyDue.order : undefined,
  });

  // O(1) lookup by itemKey instead of scanning list.items per row
  const openByKey = useMemo(() => {
    const map = new Map<string, ShoppingItem>();
    for (const item of list?.items ?? []) {
      if (!item.checked) {
        const key = itemKey(item.name);
        if (!map.has(key)) map.set(key, item);
      }
    }
    return map;
  }, [list]);

  // Items, not names, so it matches the count on the list page
  const openCount = list?.items.filter((item) => !item.checked).length ?? 0;
  const unaddedDue = catalog.due.filter(
    (item) => !item.onList && !item.checked && !(itemKey(item.name) in pendingHides),
  );
  // Once undone items are back, "Add N due" stands on its own again
  if (bulkUndo?.undone && unaddedDue.length >= 2) {
    setBulkUndo(null);
  }
  const bulkUndoActive = bulkUndo !== null && !bulkUndo.undone;
  // On a visit where everything running low is already waiting, the card has nothing to act on:
  // fold it to one line so the past buys you can still add lead the sheet
  const dueCollapsed =
    stickyDue?.listId === listId &&
    stickyDue.allOnList &&
    unaddedDue.length === 0 &&
    !dueExpanded &&
    !editing &&
    !trimmedQuery;

  /** Measure the sheet while no filter is applied (its natural size, in whatever mode it's in) */
  function lockHeightIfNeeded() {
    const sheet = sheetRef.current;
    if (!sheet || (lockedSheet !== null && trimmedQuery)) return;
    const popup = sheet.closest('[data-slot="drawer-popup"]');
    const top = popup ? sheet.getBoundingClientRect().top - popup.getBoundingClientRect().top : 0;
    setLockedSheet({ height: sheet.offsetHeight, top: Math.max(0, Math.round(top)) });
  }

  function rowElement(key: string): HTMLElement | null {
    return bodyRef.current?.querySelector(`[data-row-key="${CSS.escape(key)}"]`) ?? null;
  }

  /** Keep keyboard and screen-reader users in place when what they were on goes away */
  function focusIn(key: string, selector: string) {
    afterPaint(() => rowElement(key)?.querySelector<HTMLElement>(selector)?.focus());
  }

  /** If focus is inside something about to vanish, park it on the list instead of the page */
  function rescueFocusFrom(element: Element | null | undefined) {
    if (element?.contains(document.activeElement)) bodyRef.current?.focus({ preventScroll: true });
  }

  /** After something focused went away, put focus back on the list rather than the sheet itself */
  function rescueLostFocus() {
    afterPaint(() => {
      const active = document.activeElement;
      if (active === document.body || active?.matches('[data-slot="drawer-popup"]')) {
        bodyRef.current?.focus({ preventScroll: true });
      }
    });
  }

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

  function showTypingHint(text: string) {
    setTypingHint(text);
    clearTimeout(typingHintTimerRef.current);
    typingHintTimerRef.current = setTimeout(() => setTypingHint(null), 2_500);
  }

  /** After Enter, show which row it changed: scroll it into view and light it up once */
  function revealRow(key: string) {
    setFreshKey(key);
    clearTimeout(freshTimerRef.current);
    freshTimerRef.current = setTimeout(() => setFreshKey(null), 1_400);
    afterPaint(() => rowElement(key)?.scrollIntoView({ block: "nearest" }));
  }

  function flashHint(key: string, name: string) {
    setAnnouncement(`${name} is already on ${listName}`);
    setHintedKey(key);
    clearTimeout(hintTimerRef.current);
    hintTimerRef.current = setTimeout(() => {
      setHintedKey((prev) => (prev === key ? null : prev));
    }, 1_500);
  }

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
    setAnnouncement(`${entry.name} hidden from Buy again. Undo is there for a few seconds`);
    focusIn(key, "button");
  }

  function undoHide(key: string) {
    const pending = pendingHidesRef.current[key];
    if (!pending) return;
    clearTimeout(pending.timer);
    const next = { ...pendingHidesRef.current };
    delete next[key];
    pendingHidesRef.current = next;
    setPendingHides(next);
    setAnnouncement(`${pending.name} is back in Buy again`);
    focusIn(key, 'button[aria-label^="Hide"]');
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
        setAnnouncement(`${existing.name} is back on ${listName}`);
      } else if (untickedByKey[key]?.id === existing.id) {
        // Second tap on an item unticked in this session ticks it back off with its original ticker
        const original = untickedByKey[key];
        toggle(existing.id, true, original.checkedBy ?? viewer);
        setUntickedByKey((prev) => {
          const next = { ...prev };
          delete next[key];
          return next;
        });
        setAnnouncement(`${existing.name} ticked off again`);
      } else if (overrideQuantity) {
        // A typed amount ("3 milk") always means "make it 3", never "take it off"
        if (overrideQuantity !== existing.quantity) {
          edit(existing.id, { quantity: overrideQuantity });
          setAnnouncement(`${existing.name} set to ${overrideQuantity}`);
        } else {
          flashHint(key, existing.name);
        }
      } else if (addedIdFor(entry.name) === existing.id) {
        // Added in this session: tapping again takes it back off
        clearAdded(entry.name);
        undoAdd(listId, existing.id);
        setAnnouncement(`Took ${existing.name} off ${listName}`);
      } else {
        // Already on the list before this sheet opened (possibly a housemate's): never delete on stray tap
        flashHint(key, existing.name);
      }
      return;
    }
    const quantity = overrideQuantity ?? entry.quantity;
    const id = add(listId, entry.name, quantity);
    markAdded(entry.name, id);
    setAnnouncement(`Added ${quantity ? `${quantity} ` : ""}${entry.name} to ${listName}`);
  }

  function addAllDue() {
    if (!list || unaddedDue.length === 0) return;
    const added: { name: string; id: string }[] = [];
    const unticked: { key: string; id: string; checkedBy: Person | null }[] = [];
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
    if (count > 0) {
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
          setAnnouncement(`Took ${count} back off ${listName}`);
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
      setAnnouncement(`Added ${count} to ${listName}. Press the same button again to undo`);
      bulkTimerRef.current = setTimeout(() => {
        setBulkUndo(null);
        // If nothing's left to add, the button goes with it
        rescueLostFocus();
      }, BULK_UNDO_MS);
    }
  }

  function quickAddParsed() {
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
        setAnnouncement(`${existing.name} is back on ${listName}`);
      } else if (parsedQuery.quantity && parsedQuery.quantity !== existing.quantity) {
        edit(existing.id, { quantity: parsedQuery.quantity });
        setAnnouncement(`${existing.name} set to ${parsedQuery.quantity}`);
      } else {
        setAnnouncement(`${existing.name} is already on ${listName}`);
      }
      setQuery("");
      return;
    }
    const { name, quantity } = parsedQuery;
    const id = add(listId, name, quantity);
    markAdded(name, id);
    const message = `Added ${quantity ? `${quantity} ` : ""}${name} to ${listName}`;
    setAnnouncement(message);
    // A new item has no row here yet, so say so where you can see it, with a way back
    showUndoBar({
      message,
      undo: () => {
        clearAdded(name);
        undoAdd(listId, id);
        setAnnouncement(`Took ${name} off ${listName}`);
        hideUndoBar();
      },
    });
    setQuery("");
  }

  /**
   * Enter in the filter does what the sheet shows it will: the highlighted row (see
   * `filterEnterTarget`), or the highlighted "Add" card. When several past buys fit, it says to
   * keep typing and the keyboard stays up.
   */
  function addFromSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!list || !enter || !parsedQuery) return;
    // Close the phone keyboard to show the result; on a computer, stay ready for the next one
    const search = window.matchMedia("(pointer: coarse)").matches ? searchRef.current : null;
    if (enter.kind === "item") {
      search?.blur();
      const target = enter.item;
      const key = itemKey(target.name);
      if (target.onList && !parsedQuery.quantity) {
        flashHint(key, target.name);
      } else {
        toggleRow(target, parsedQuery.quantity ?? null);
      }
      setQuery("");
      revealRow(key);
    } else if (enter.kind === "add") {
      search?.blur();
      quickAddParsed();
    } else {
      // Cleared first, so pressing Enter again is announced again
      setAnnouncement("");
      afterPaint(() => setAnnouncement(`${enter.count} past buys fit. Keep typing to pick one`));
      showTypingHint(`${enter.count} fit · keep typing`);
    }
  }

  function handleSearchKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Escape" && query) {
      event.stopPropagation();
      setQuery("");
    }
  }

  function stepRowQuantity(item: ShoppingItem, delta: 1 | -1) {
    const next = stepQuantity(item.quantity ?? "", delta);
    if (next === null) return;
    edit(item.id, { quantity: next || null });
  }

  const loadingList = list === undefined;
  const showFooter = !editing && !keyboardUp && !touchTyping;
  // What Enter would do right now, so the sheet can show it before you press it
  const enter =
    trimmedQuery && parsedQuery?.name && !editing && list
      ? filterEnterTarget(
          catalog.sections.flatMap((section) => section.items),
          parsedQuery.name,
        )
      : null;
  const typedOnList =
    enter && parsedQuery?.name && list ? findOnList(list.items, parsedQuery.name) : undefined;
  // Only mark what Enter would change: on an item already waiting with the same amount, Enter just
  // says so, and a highlight would promise an action that doesn't happen
  const enterChangesItem =
    enter?.kind === "item" &&
    !(
      enter.item.onList &&
      (!parsedQuery?.quantity ||
        parsedQuery.quantity === openByKey.get(itemKey(enter.item.name))?.quantity)
    );
  const enterKey = enter?.kind === "item" && enterChangesItem ? itemKey(enter.item.name) : null;
  const enterAddsTyped =
    enter?.kind === "add" &&
    !(
      typedOnList &&
      !typedOnList.checked &&
      (!parsedQuery?.quantity || parsedQuery.quantity === typedOnList.quantity)
    );
  // Offer adding exactly what was typed whenever no past buy has that name
  const showAddTyped =
    enter !== null &&
    parsedQuery?.name !== undefined &&
    !(enter.kind === "item" && itemKey(enter.item.name) === itemKey(parsedQuery.name));
  const addTypedCard =
    showAddTyped && parsedQuery?.name ? (
      <QuickAddCard
        name={parsedQuery.name}
        quantity={parsedQuery.quantity}
        existing={typedOnList}
        listName={listName}
        enterTarget={enterAddsTyped}
        onAdd={quickAddParsed}
      />
    ) : null;

  return (
    <div
      ref={sheetRef}
      style={
        lockedSheet !== null && trimmedQuery
          ? {
              // Never taller than the sheet can be now (the keyboard may have come up since),
              // so the last results always stay reachable
              minHeight: `min(${lockedSheet.height}px, calc(var(--drawer-content-max-height) - ${lockedSheet.top}px))`,
            }
          : undefined
      }
      className="flex min-h-0 flex-1 flex-col"
    >
      <SheetEyebrow
        icon={ClockCounterClockwiseIcon}
        actions={
          history.length > 0 && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => {
                if (editing) commitAllPendingHides();
                setEditing((prev) => !prev);
              }}
              className={cn(
                "h-11 rounded-full px-3.5 text-sm font-[700]",
                editing ? "bg-area-tint text-area-fg" : "text-muted-foreground",
              )}
            >
              {editing ? "Done" : "Edit"}
            </Button>
          )
        }
      >
        Buy again · {listName}
      </SheetEyebrow>
      <DrawerTitle className="sr-only">Buy again for {listName}</DrawerTitle>
      <DrawerDescription className="sr-only">
        Tap past buys to put them on {listName}, adjust amounts, or tap Edit to hide items you no
        longer buy.
      </DrawerDescription>

      <div className="relative z-20 shrink-0 px-4 pt-1 pb-2">
        <form onSubmit={addFromSearch} className="relative">
          <MagnifyingGlassIcon
            aria-hidden
            weight="bold"
            className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-muted-foreground"
          />
          <input
            ref={searchRef}
            type="search"
            aria-label="Filter past buys"
            placeholder="Filter past buys"
            value={query}
            onFocus={() => {
              lockHeightIfNeeded();
              setTouchTyping(window.matchMedia("(pointer: coarse)").matches);
            }}
            onBlur={() => setTouchTyping(false)}
            onKeyDown={handleSearchKeyDown}
            onChange={(event) => {
              lockHeightIfNeeded();
              // New results start at the top, where the best matches are
              if (event.target.value.trim() !== trimmedQuery && bodyRef.current) {
                bodyRef.current.scrollTop = 0;
              }
              setQuery(event.target.value);
              setTypingHint(null);
            }}
            autoComplete="off"
            enterKeyHint="go"
            className="h-11 w-full rounded-2xl bg-card pr-11 pl-10 text-base font-medium shadow-card outline-none placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-area/40 [&::-webkit-search-cancel-button]:hidden"
          />
          {query && (
            <button
              type="button"
              aria-label="Clear filter"
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => setQuery("")}
              className="absolute top-1/2 right-1 grid size-9 -translate-y-1/2 place-items-center rounded-full text-muted-foreground transition-transform duration-150 ease-(--ease-out) hover:bg-muted hover:text-foreground active:scale-[0.92] motion-reduce:active:scale-100"
            >
              <XIcon aria-hidden weight="bold" className="size-4" />
            </button>
          )}
          {typingHint && (
            // The live region already says this; this is the visible version. It sits inside the
            // field, next to what was typed, so it covers no results and never shifts the layout
            <p
              aria-hidden
              className="pointer-events-none absolute top-1/2 right-11 max-w-[60%] -translate-y-1/2 truncate rounded-full bg-area-tint px-2.5 py-1 text-xs font-semibold text-area-fg transition-[opacity,translate] duration-150 ease-(--ease-out) starting:translate-x-1 starting:opacity-0 motion-reduce:transition-none"
            >
              {typingHint}
            </p>
          )}
        </form>

        {catalog.hasOtherLists && (
          <div className="mt-2.5 flex min-h-11 items-center">
            {trimmedQuery ? (
              <p className="px-1 text-[0.8125rem] font-medium text-muted-foreground">
                Searching all lists
              </p>
            ) : (
              <fieldset className="flex min-w-0 flex-1 gap-2">
                <legend className="sr-only">Which past buys to show</legend>
                <Button
                  type="button"
                  variant="chip"
                  aria-pressed={!includeOtherLists}
                  onClick={() => {
                    if (bodyRef.current) bodyRef.current.scrollTop = 0;
                    setIncludeOtherLists(false);
                  }}
                  className="max-w-[55%] aria-pressed:font-medium"
                >
                  <span className="truncate">{listName}</span>
                </Button>
                <Button
                  type="button"
                  variant="chip"
                  aria-pressed={includeOtherLists}
                  onClick={() => {
                    if (bodyRef.current) bodyRef.current.scrollTop = 0;
                    setIncludeOtherLists(true);
                  }}
                  className="aria-pressed:font-medium"
                >
                  All lists
                </Button>
              </fieldset>
            )}
          </div>
        )}
      </div>

      <div
        ref={bodyRef}
        tabIndex={-1}
        aria-busy={loadingList || undefined}
        className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pb-4 outline-none"
      >
        {loadingList ? (
          <div className="space-y-3 pt-1" aria-label="Loading list">
            <div className="overflow-clip rounded-[20px] bg-card shadow-card">
              {[0, 1, 2, 3].map((row) => (
                <div
                  key={row}
                  className="flex min-h-14 items-center gap-3 border-t border-border px-4 py-3 first:border-t-0"
                >
                  <span className="size-7 shrink-0 animate-[skeleton-breathe_1.6s_ease-in-out_infinite] rounded-full bg-muted" />
                  <span className="h-4 w-36 animate-[skeleton-breathe_1.6s_ease-in-out_infinite] rounded-md bg-muted" />
                </div>
              ))}
            </div>
          </div>
        ) : catalog.total === 0 ? (
          addTypedCard ? (
            <div className="space-y-3 pt-3">
              <p className="px-1 text-sm text-muted-foreground">
                Nothing bought before matching &ldquo;{trimmedQuery}&rdquo;.
              </p>
              {addTypedCard}
            </div>
          ) : (
            <p className="py-10 text-center text-sm text-muted-foreground">
              {trimmedQuery ? (
                <>Nothing bought before matching &ldquo;{trimmedQuery}&rdquo;.</>
              ) : (
                <>Nothing from {listName} yet.</>
              )}
              {!trimmedQuery && catalog.hasOtherLists && !includeOtherLists && (
                <>
                  {" "}
                  <button
                    type="button"
                    onClick={() => setIncludeOtherLists(true)}
                    className="font-semibold text-area-fg underline-offset-4 hover:underline"
                  >
                    Show all lists
                  </button>
                </>
              )}
            </p>
          )
        ) : (
          <div className="space-y-3 pt-1">
            {enter?.kind === "add" && addTypedCard}
            {catalog.due.length > 0 && dueCollapsed && (
              <section aria-labelledby="buy-again-due-heading" className={SHEET_CARD}>
                <button
                  type="button"
                  aria-expanded={false}
                  onClick={() => setDueExpanded(true)}
                  className="flex min-h-14 w-full items-center gap-2.5 px-4 py-2.5 text-left outline-none transition-colors duration-150 hover:bg-muted/50 focus-visible:ring-3 focus-visible:ring-ring/80 focus-visible:ring-inset active:bg-muted/70"
                >
                  <span
                    aria-hidden
                    className="grid size-7 shrink-0 place-items-center rounded-[9px] bg-area-tint text-area-fg"
                  >
                    <CheckIcon weight="bold" className="size-4" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <h3
                      id="buy-again-due-heading"
                      className="truncate text-[0.9375rem] font-[780] tracking-[-0.01em] [font-stretch:112%]"
                    >
                      Running low
                    </h3>
                    <span className="block truncate text-xs text-muted-foreground">
                      {catalog.due.length === 1
                        ? `It's already on ${listName}`
                        : `All ${catalog.due.length} are already on ${listName}`}
                    </span>
                  </span>
                  <span className="flex shrink-0 items-center gap-1 text-sm font-semibold text-muted-foreground">
                    Show
                    <CaretDownIcon aria-hidden weight="bold" className="size-3.5" />
                  </span>
                </button>
              </section>
            )}
            {catalog.due.length > 0 && !dueCollapsed && (
              <section aria-labelledby="buy-again-due-heading" className={SHEET_CARD}>
                <StickyCardHead>
                  <div className={cn(STICKY_CARD_HEAD_INNER, "gap-2")}>
                    <h3
                      id="buy-again-due-heading"
                      className="flex min-w-0 items-center gap-2.5 text-[0.9375rem] font-[780] tracking-[-0.01em] [font-stretch:112%]"
                    >
                      <span
                        aria-hidden
                        className="grid size-7 shrink-0 place-items-center rounded-[9px] bg-area-tint text-area-fg"
                      >
                        <ClockIcon weight="bold" className="size-4" />
                      </span>
                      <span className="truncate">Running low</span>
                    </h3>
                    {!editing && (bulkUndo || unaddedDue.length >= 2) && (
                      <Button
                        type="button"
                        variant="soft"
                        size="sm"
                        data-add-due
                        aria-label={
                          bulkUndo && bulkUndoActive
                            ? `Undo adding ${bulkUndo.count} to ${listName}`
                            : undefined
                        }
                        onClick={bulkUndo && bulkUndoActive ? bulkUndo.undo : addAllDue}
                        className="h-9 gap-1.5 rounded-full px-3.5 font-[700] tabular-nums after:-inset-y-1"
                      >
                        {bulkUndoActive ? (
                          <>
                            <ArrowCounterClockwiseIcon
                              aria-hidden
                              weight="bold"
                              className="size-4"
                            />
                            Undo
                          </>
                        ) : (
                          `Add ${Math.max(unaddedDue.length, bulkUndo?.count ?? 0)} due`
                        )}
                      </Button>
                    )}
                  </div>
                </StickyCardHead>
                <ul>
                  {catalog.due.map((entry) => {
                    const key = itemKey(entry.name);
                    const listItem = openByKey.get(key);
                    return (
                      <CatalogRow
                        key={entry.name}
                        entry={entry}
                        now={now}
                        viewerId={viewer.id}
                        listItem={listItem}
                        addedHere={listItem !== undefined && addedIdFor(entry.name) === listItem.id}
                        untickedHere={
                          listItem !== undefined && untickedByKey[key]?.id === listItem.id
                        }
                        hinted={hintedKey === key}
                        fresh={freshKey === key}
                        enterTarget={enterKey === key}
                        editing={editing}
                        pendingHide={key in pendingHides}
                        collapsing={key in collapsingHides}
                        typedQuantity={parsedQuery?.quantity ?? null}
                        onToggle={() => toggleRow(entry, parsedQuery?.quantity ?? null)}
                        onStep={(item, delta) => stepRowQuantity(item, delta)}
                        onHide={() => scheduleHide(entry)}
                        onUndoHide={() => undoHide(key)}
                      />
                    );
                  })}
                </ul>
              </section>
            )}

            {catalog.sections.map(({ category, items }) => {
              const CategoryIcon = CATEGORY_ICONS[category];
              return (
                <section key={category} className={SHEET_CARD}>
                  <StickyCardHead>
                    <h3 className={cn(STICKY_CARD_HEAD_INNER, "gap-3")}>
                      <span className="flex min-w-0 items-center gap-2.5">
                        <span
                          aria-hidden
                          className="grid size-7 shrink-0 place-items-center rounded-[9px] bg-area-tint text-area-fg"
                        >
                          <CategoryIcon weight="bold" className="size-4" />
                        </span>
                        <span className="truncate text-[0.9375rem] font-[780] tracking-[-0.01em] [font-stretch:112%]">
                          {category}
                        </span>
                      </span>
                      <span className="shrink-0 text-[0.8125rem] font-semibold text-muted-foreground tabular-nums">
                        {items.length}
                      </span>
                    </h3>
                  </StickyCardHead>
                  <ul>
                    {items.map((entry) => {
                      const key = itemKey(entry.name);
                      const listItem = openByKey.get(key);
                      return (
                        <CatalogRow
                          key={entry.name}
                          entry={entry}
                          now={now}
                          viewerId={viewer.id}
                          listItem={listItem}
                          addedHere={
                            listItem !== undefined && addedIdFor(entry.name) === listItem.id
                          }
                          untickedHere={
                            listItem !== undefined && untickedByKey[key]?.id === listItem.id
                          }
                          hinted={hintedKey === key}
                          fresh={freshKey === key}
                          enterTarget={enterKey === key}
                          editing={editing}
                          pendingHide={key in pendingHides}
                          collapsing={key in collapsingHides}
                          typedQuantity={parsedQuery?.quantity ?? null}
                          onToggle={() => toggleRow(entry, parsedQuery?.quantity ?? null)}
                          onStep={(item, delta) => stepRowQuantity(item, delta)}
                          onHide={() => scheduleHide(entry)}
                          onUndoHide={() => undoHide(key)}
                        />
                      );
                    })}
                  </ul>
                </section>
              );
            })}
            {enter?.kind !== "add" && addTypedCard}
          </div>
        )}
      </div>

      {/* Always mounted, so screen readers hear each change of its text */}
      <p aria-live="polite" className="sr-only">
        {announcement}
      </p>

      {/* "Added x · Undo" after adding something new from the filter; folds in and out */}
      <div
        className={cn(
          "grid shrink-0 transition-[grid-template-rows,opacity] duration-200 ease-(--ease-out) motion-reduce:transition-none",
          undoBar ? "grid-rows-[1fr] opacity-100" : "pointer-events-none grid-rows-[0fr] opacity-0",
        )}
      >
        <div ref={undoBarRef} className="min-h-0 overflow-hidden" inert={!undoBar}>
          {lastUndoBar && (
            <div className="mx-4 mb-2 flex min-h-12 items-center justify-between gap-3 rounded-2xl bg-[var(--toast-bg)] pr-2 pl-4 text-sm font-medium text-[var(--toast-fg)] shadow-raised">
              <span className="min-w-0 truncate">{lastUndoBar.message}</span>
              <button
                type="button"
                onClick={lastUndoBar.undo}
                className="h-10 shrink-0 rounded-xl px-3 text-sm font-[750] text-[var(--toast-act)] outline-none hover:bg-white/10 focus-visible:ring-2 focus-visible:ring-ring/80 active:scale-[0.95] motion-reduce:active:scale-100"
              >
                Undo
              </button>
            </div>
          )}
        </div>
      </div>

      <div
        className={cn(
          "grid shrink-0 transition-[grid-template-rows,opacity] duration-200 ease-(--ease-out) motion-reduce:transition-none",
          showFooter
            ? "grid-rows-[1fr] opacity-100"
            : "pointer-events-none grid-rows-[0fr] opacity-0",
        )}
      >
        <div className="min-h-0 overflow-hidden" inert={!showFooter}>
          <div className="border-t border-border bg-canvas px-4 pt-3 pb-[calc(1rem+env(safe-area-inset-bottom))]">
            <DrawerClose
              render={
                // A word space between "3" and "on Groceries", not the button's icon gap
                <Button size="xl" className="w-full min-w-0 max-w-full gap-[0.28em] tabular-nums">
                  {openCount > 0 ? (
                    <>
                      <span className="shrink-0">
                        Done ·{" "}
                        <span
                          key={openCount}
                          className={cn(
                            ready &&
                              "transition-opacity duration-150 ease-(--ease-out) starting:opacity-60 motion-reduce:transition-none",
                          )}
                        >
                          {openCount}
                        </span>
                      </span>
                      <span className="min-w-0 truncate">on {listName}</span>
                    </>
                  ) : (
                    "Done"
                  )}
                </Button>
              }
            />
          </div>
        </div>
      </div>
    </div>
  );
}

/** A small Return key on whatever Enter in the filter would act on */
function EnterKeyHint() {
  return (
    <kbd
      aria-hidden
      className="grid h-5 shrink-0 place-items-center rounded-md bg-area/15 px-1.5 font-sans text-xs font-[750] text-area-fg ring-1 ring-area/30 ring-inset"
    >
      ↵
    </kbd>
  );
}

/**
 * "Add what I typed" as a card: for something never bought before, or when no past buy has that
 * exact name. Says what tapping it will do when the name is already on the list.
 */
function QuickAddCard({
  name,
  quantity,
  existing,
  listName,
  enterTarget,
  onAdd,
}: {
  name: string;
  quantity: string | null;
  existing: ShoppingItem | undefined;
  listName: string;
  /** Enter in the filter would do this */
  enterTarget: boolean;
  onAdd: () => void;
}) {
  return (
    <div
      className={cn(
        "overflow-clip rounded-[20px] bg-card shadow-card transition-[background-color,box-shadow] duration-150",
        enterTarget && "bg-area-tint ring-1 ring-area/45 ring-inset",
      )}
    >
      <button
        type="button"
        onClick={onAdd}
        className="flex min-h-14 w-full items-center gap-3 px-4 py-3 text-left outline-none transition-colors duration-150 hover:bg-muted/50 focus-visible:ring-3 focus-visible:ring-ring/80 focus-visible:ring-inset active:bg-muted/70"
      >
        <span
          aria-hidden
          className="grid size-7 shrink-0 place-items-center rounded-full bg-primary text-primary-foreground"
        >
          {existing && !existing.checked ? (
            <CheckIcon weight="bold" className="size-4" />
          ) : (
            <PlusIcon weight="bold" className="size-4" />
          )}
        </span>
        <span className="min-w-0 flex-1">
          <span className="line-clamp-2 block text-[1.0625rem] font-medium break-words text-foreground">
            {existing
              ? existing.checked
                ? `Untick "${existing.name}"`
                : quantity && quantity !== existing.quantity
                  ? `Update "${existing.name}" to ${quantity}`
                  : `"${existing.name}" is already on ${listName}`
              : `Add ${quantity ? `${quantity} ` : ""}"${name}" to ${listName}`}
          </span>
          <span className="block truncate text-xs text-muted-foreground">
            {existing
              ? existing.checked
                ? "Ticked · tap to get again"
                : existing.quantity
                  ? `Waiting, ${existing.quantity}`
                  : "Already waiting on this list"
              : categorize(name)}
          </span>
        </span>
        {enterTarget && <EnterKeyHint />}
      </button>
    </div>
  );
}

function CatalogRow({
  entry,
  now,
  viewerId,
  listItem,
  addedHere,
  untickedHere,
  hinted,
  fresh,
  enterTarget,
  editing,
  pendingHide,
  collapsing,
  typedQuantity,
  onToggle,
  onStep,
  onHide,
  onUndoHide,
}: {
  entry: BuyAgainCatalogItem;
  now: Temporal.Instant;
  viewerId: string;
  listItem: ShoppingItem | undefined;
  addedHere: boolean;
  untickedHere: boolean;
  hinted: boolean;
  /** Just changed from the filter's Enter: light up once */
  fresh: boolean;
  /** What Enter in the filter would act on right now */
  enterTarget: boolean;
  editing: boolean;
  pendingHide: boolean;
  collapsing: boolean;
  typedQuantity: string | null;
  onToggle: () => void;
  onStep: (item: ShoppingItem, delta: 1 | -1) => void;
  onHide: () => void;
  onUndoHide: () => void;
}) {
  const onList = entry.onList && listItem !== undefined;
  // Paired rows lead with "Goes with your list", and rows on the list make room for the stepper,
  // so both drop the cycle to stay on one line
  const cue = lastBoughtCue(
    entry.lastBoughtAt,
    onList || entry.paired ? null : entry.usualDays,
    now,
  );
  const fewer = onList ? stepQuantity(listItem.quantity ?? "", -1) : null;
  const more = onList ? stepQuantity(listItem.quantity ?? "", 1) : null;
  const currentQty = listItem?.quantity ?? "1";
  const displayQty = typedQuantity ?? entry.quantity;
  const housemateAdded =
    onList && !addedHere && !untickedHere && listItem.addedBy && listItem.addedBy.id !== viewerId
      ? `Added by ${firstName(listItem.addedBy.name)}`
      : null;
  // Pop the check and stepper in only when this row goes onto the list while you watch. A row
  // that mounts already on the list (opening, filtering, switching lists) appears as it is.
  const [shownOnList, setShownOnList] = useState(onList);
  const [justAdded, setJustAdded] = useState(false);
  if (onList !== shownOnList) {
    setShownOnList(onList);
    setJustAdded(onList);
  }
  const animate = justAdded;

  return (
    <li
      data-row-key={itemKey(entry.name)}
      className={cn(
        // Reduced motion keeps the tint, just without the fade
        fresh &&
          "animate-[row-fresh_1.4s_var(--ease-out)] motion-reduce:animate-none motion-reduce:bg-primary-soft/60",
        enterTarget && "bg-area-tint ring-1 ring-area/45 ring-inset last:rounded-b-[20px]",
        "relative grid transition-[grid-template-rows,opacity] duration-200 ease-(--ease-out) before:absolute before:top-0 before:right-0 before:left-[3.5rem] before:h-px before:bg-border first:before:hidden motion-reduce:transition-none",
        collapsing
          ? "pointer-events-none grid-rows-[0fr] opacity-0"
          : "grid-rows-[1fr] opacity-100",
      )}
    >
      <div className="min-h-0 overflow-hidden" inert={collapsing}>
        {/* Stays the "hidden" strip while it folds away, so it never flashes back to the item */}
        {pendingHide || collapsing ? (
          <div className="flex min-h-14 items-center justify-between gap-3 bg-muted/50 pr-2 pl-4 transition-opacity duration-180 ease-(--ease-out) starting:opacity-0 motion-reduce:transition-none">
            <span className="min-w-0 truncate text-sm text-muted-foreground">
              {entry.name} hidden
            </span>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={onUndoHide}
              className="h-11 shrink-0 rounded-xl px-3.5 text-sm font-[750] text-area-fg"
            >
              Undo
            </Button>
          </div>
        ) : (
          <div className="flex min-h-14 items-center gap-1 pr-3 transition-colors duration-100 has-[>button:first-child:active]:bg-muted/70">
            {editing ? (
              <div className="flex min-h-14 min-w-0 flex-1 items-center gap-3 py-2.5 pl-4">
                <button
                  type="button"
                  aria-label={`Hide ${entry.name} from Buy again`}
                  onClick={onHide}
                  className="relative grid size-7 shrink-0 place-items-center rounded-full text-destructive outline-none transition-[transform,opacity] duration-180 ease-(--ease-out) after:absolute after:-inset-2 focus-visible:ring-3 focus-visible:ring-destructive/40 active:scale-[0.9] starting:scale-90 starting:opacity-0 motion-reduce:transition-none motion-reduce:active:scale-100"
                >
                  <MinusCircleIcon aria-hidden weight="fill" className="size-6" />
                </button>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[1.0625rem] font-medium text-foreground">
                    {entry.name}
                  </span>
                  <span className="block truncate text-xs text-muted-foreground">{cue}</span>
                </span>
              </div>
            ) : (
              <button
                type="button"
                aria-pressed={onList}
                onClick={onToggle}
                className="flex min-h-14 min-w-0 flex-1 items-center gap-3 py-2.5 pl-4 text-left outline-none focus-visible:bg-muted/60 focus-visible:ring-2 focus-visible:ring-ring/80 focus-visible:ring-inset"
              >
                <span
                  aria-hidden
                  className={cn(
                    "grid size-7 shrink-0 place-items-center rounded-full transition-colors duration-150 ease-(--ease-out)",
                    onList || enterTarget
                      ? "bg-primary text-primary-foreground"
                      : "border border-border bg-card text-area-fg",
                  )}
                >
                  {onList ? (
                    <CheckIcon
                      weight="bold"
                      className={cn(
                        "size-4",
                        animate &&
                          "animate-[check-pop_220ms_var(--ease-out)] motion-reduce:animate-none",
                      )}
                    />
                  ) : (
                    <PlusIcon weight="bold" className="size-3.5" />
                  )}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex min-w-0 items-center gap-2">
                    <span className="truncate text-[1.0625rem] font-medium text-foreground">
                      {entry.name}
                    </span>
                    {enterTarget && <EnterKeyHint />}
                  </span>
                  <span
                    className={cn(
                      "block truncate text-xs transition-colors duration-200",
                      hinted ? "font-semibold text-area-fg" : "text-muted-foreground",
                    )}
                  >
                    {entry.checked ? (
                      "Ticked · tap to get again"
                    ) : untickedHere ? (
                      "Back on list"
                    ) : housemateAdded ? (
                      housemateAdded
                    ) : onList && !addedHere ? (
                      "Already on list"
                    ) : entry.paired && !onList ? (
                      <>
                        <span className="font-semibold text-area-fg">Goes with your list</span> ·{" "}
                        {cue}
                      </>
                    ) : (
                      cue
                    )}
                  </span>
                </span>
              </button>
            )}

            {!editing && onList ? (
              <div
                className={cn(
                  "flex shrink-0 items-center gap-1",
                  animate &&
                    "transition-[opacity,scale,filter] duration-180 ease-(--ease-out) starting:scale-96 starting:opacity-0 starting:blur-[2px] motion-reduce:transition-none motion-reduce:starting:scale-100 motion-reduce:starting:blur-none",
                )}
              >
                {more !== null ? (
                  <>
                    <button
                      type="button"
                      aria-label={`One fewer ${entry.name}`}
                      disabled={!fewer}
                      onClick={() => onStep(listItem, -1)}
                      className="relative grid size-9 place-items-center rounded-full bg-muted text-foreground outline-none transition-[background-color,scale,opacity] duration-150 ease-(--ease-out) after:absolute after:-inset-1 hover:bg-secondary focus-visible:ring-2 focus-visible:ring-ring/80 active:scale-[0.92] disabled:opacity-35 motion-reduce:active:scale-100"
                    >
                      <MinusIcon aria-hidden weight="bold" className="size-3.5" />
                    </button>
                    <span
                      aria-live="polite"
                      className="max-w-24 min-w-6 truncate px-1 text-center text-sm font-[750] text-foreground tabular-nums"
                    >
                      {currentQty}
                    </span>
                    <button
                      type="button"
                      aria-label={`One more ${entry.name}`}
                      onClick={() => onStep(listItem, 1)}
                      className="relative grid size-9 place-items-center rounded-full bg-muted text-foreground outline-none transition-[background-color,scale,opacity] duration-150 ease-(--ease-out) after:absolute after:-inset-1 hover:bg-secondary focus-visible:ring-2 focus-visible:ring-ring/80 active:scale-[0.92] motion-reduce:active:scale-100"
                    >
                      <PlusIcon aria-hidden weight="bold" className="size-3.5" />
                    </button>
                  </>
                ) : (
                  listItem.quantity && (
                    <span className="max-w-24 truncate rounded-full bg-primary-soft px-2.5 py-1 text-xs font-[700] text-primary-soft-foreground tabular-nums">
                      {listItem.quantity}
                    </span>
                  )
                )}
              </div>
            ) : !editing && displayQty ? (
              <span className="max-w-24 shrink-0 truncate rounded-full bg-muted px-2.5 py-0.5 text-xs font-semibold text-muted-foreground tabular-nums">
                {displayQty}
              </span>
            ) : null}
          </div>
        )}
      </div>
    </li>
  );
}
