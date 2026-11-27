import { useQuery } from "@tanstack/react-query";
import {
  useCallback,
  useDeferredValue,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type FormEvent,
  type RefObject,
} from "react";

import { ClockCounterClockwiseIcon } from "@/components/icons.ts";
import { SheetContent, SheetEyebrow } from "@/components/layout/Sheet.tsx";
import { Button } from "@/components/ui/button";
import { Drawer, DrawerDescription, DrawerTitle } from "@/components/ui/drawer";
import { offerUndo } from "@/lib/feedback.ts";
import type { PersonSummary } from "@/lib/shared-with.ts";
import { useKeyboardOffset } from "@/lib/use-keyboard-offset.ts";
import { cn } from "cn";

import { filterEnterTarget, runningLowToAdd } from "../buy-again.ts";
import {
  afterPaint,
  useBuyAgainSession,
  usePendingHides,
  useStickyRunningLowOrder,
  useTimedValue,
} from "../buy-again-sheet.hooks.ts";
import { findOnList, itemKey, parseEntry } from "../item-entry.ts";
import type { Outcome } from "../list-entry.ts";
import { useListEntry } from "../list-entry.hooks.ts";
import type { BoughtItem, ShoppingItem } from "../shopping.api.ts";
import { useBuyAgainFor, useForgetBuyAgain } from "../shopping.hooks.ts";
import { historyQuery, listQuery } from "../shopping.queries.ts";
import { BuyAgainCatalog } from "./BuyAgainCatalog.tsx";
import { BuyAgainFooter } from "./BuyAgainFooter.tsx";
import { BuyAgainQuickAddCard } from "./BuyAgainQuickAddCard.tsx";
import { BuyAgainSearchBar } from "./BuyAgainSearchBar.tsx";

/** One empty history, so "not loaded yet" doesn't hand memos a new array every render */
const NO_HISTORY: BoughtItem[] = [];

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
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  listId: string;
  listName: string;
  viewer: PersonSummary;
}) {
  const bodyRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const entry = useListEntry(listId, viewer);
  // What this opening of the sheet put on the list, for one Undo when it closes
  const putRef = useRef<Outcome[]>([]);
  const commitPendingHidesRef = useRef<() => void>(() => {});
  // Keep content mounted until the drawer's exit animation finishes, and bump sessionId on each open
  const [session, setSession] = useState({ mounted: open, id: open ? 1 : 0, wasOpen: open });
  if (open && !session.wasOpen) {
    setSession({ mounted: true, id: session.id + 1, wasOpen: true });
  } else if (!open && session.wasOpen) {
    setSession((prev) => ({ ...prev, wasOpen: false }));
  }

  const keyboard = useKeyboardOffset(session.mounted);

  // Stable identities, so the content's registration effect runs once per session. If it re-ran,
  // its cleanup would commit pending hides and cut their Undo short.
  const handlePut = useCallback((outcomes: readonly Outcome[]) => {
    putRef.current.push(...outcomes);
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

  /** Closing the sheet hides what it did, so offer to take back what's still there */
  function offerSessionUndo() {
    const put = putRef.current;
    putRef.current = [];
    const still = put.filter((outcome) =>
      outcome.kind === "added"
        ? entry.status(outcome.name) === "added"
        : outcome.kind === "unticked" && entry.status(outcome.item.name) === "unticked",
    );
    if (still.length === 0) return;
    offerUndo(`Added ${still.length} to ${listName}`, () => {
      entry.undo(still);
    });
  }

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
          offerSessionUndo();
        }
        onOpenChange(nextOpen);
      }}
      onOpenChangeComplete={(nextOpen) => {
        if (!nextOpen) setSession((prev) => ({ ...prev, mounted: false }));
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
            onPut={handlePut}
            registerCommitPendingHides={registerCommitPendingHides}
          />
        )}
      </SheetContent>
    </Drawer>
  );
}

function BuyAgainSheetContent({
  listId,
  listName,
  viewer,
  keyboardUp,
  bodyRef,
  searchRef,
  onPut,
  registerCommitPendingHides,
}: {
  listId: string;
  listName: string;
  viewer: PersonSummary;
  keyboardUp: boolean;
  bodyRef: RefObject<HTMLDivElement | null>;
  searchRef: RefObject<HTMLInputElement | null>;
  onPut: (outcomes: readonly Outcome[]) => void;
  registerCommitPendingHides: (fn: () => void) => void;
}) {
  const [query, setQuery] = useState("");
  const deferredQuery = useDeferredValue(query);
  const [includeOtherLists, setIncludeOtherLists] = useState(false);
  const [editing, setEditing] = useState(false);
  // Gate row animations until after first paint so arrival/filter never fires a burst of pops
  const [ready, setReady] = useState(false);
  // Transient visual cues: pre-existing row hint, ambiguous-Enter hint, and Enter-changed highlight
  const hinted = useTimedValue<string>(1_500);
  const typingHint = useTimedValue<string>(2_500);
  const fresh = useTimedValue<string>(1_400);
  // What the always-mounted live region says after each change, for screen readers
  const [announcement, setAnnouncement] = useState("");
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
  const forget = useForgetBuyAgain();

  useEffect(() => {
    const id = requestAnimationFrame(() => setReady(true));
    return () => cancelAnimationFrame(id);
  }, []);

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

  function flashHint(key: string, name: string) {
    setAnnouncement(`${name} is already on ${listName}`);
    hinted.show(key);
  }

  /** After Enter, show which row it changed: scroll it into view and light it up once */
  function revealRow(key: string) {
    fresh.show(key);
    afterPaint(() => rowElement(key)?.scrollIntoView({ block: "nearest" }));
  }

  const { pendingHides, collapsingHides, scheduleHide, undoHide, commitAllPendingHides } =
    usePendingHides({
      forget,
      rescueFocusFromRow: (key) => rescueFocusFrom(rowElement(key)),
      focusRow: focusIn,
      onAnnounce: setAnnouncement,
      registerCommitPendingHides,
    });

  const buyAgain = useBuyAgainFor(listId, now);
  const {
    stickyRunningLowOrder,
    allRunningLowInitiallyOnList,
    runningLowExpanded,
    expandRunningLow,
  } = useStickyRunningLowOrder(listId, buyAgain);

  const trimmedQuery = query.trim();
  const parsedQuery = trimmedQuery ? parseEntry(trimmedQuery) : null;
  const parsedDeferred = deferredQuery.trim() ? parseEntry(deferredQuery) : null;

  const catalog = buyAgain.browse({
    query: parsedDeferred?.name ?? "",
    includeOtherLists,
    stickyRunningLowOrder,
  });

  // O(1) lookup by itemKey instead of scanning list.items per row
  const openByKey = new Map<string, ShoppingItem>();
  for (const item of list?.items ?? []) {
    if (!item.checked) {
      const key = itemKey(item.name);
      if (!openByKey.has(key)) openByKey.set(key, item);
    }
  }

  // Items, not names, so it matches the count on the list page
  const openCount = list?.items.filter((item) => !item.checked).length ?? 0;
  // What "Add all" adds: the one definition the dock counts too, less rows being hidden right now
  const toAdd = runningLowToAdd(catalog).filter((item) => !(itemKey(item.name) in pendingHides));

  const {
    statusOf,
    bulkUndo,
    bulkUndoActive,
    undoBar,
    lastUndoBar,
    toggleRow,
    addAllRunningLow,
    quickAddParsed,
    stepRowQuantity,
  } = useBuyAgainSession({
    listId,
    listName,
    viewer,
    list,
    runningLowToAdd: toAdd,
    undoBarRef,
    onAnnounce: setAnnouncement,
    onFlashHint: flashHint,
    onClearQuery: () => setQuery(""),
    onPut,
    rescueFocusFrom,
    rescueLostFocus,
  });

  // On a visit where everything running low is already waiting, the card has nothing to act on:
  // fold it to one line so the past buys you can still add lead the sheet
  const runningLowCollapsed =
    allRunningLowInitiallyOnList &&
    toAdd.length === 0 &&
    !runningLowExpanded &&
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
      quickAddParsed(parsedQuery);
    } else {
      // Cleared first, so pressing Enter again is announced again
      setAnnouncement("");
      afterPaint(() => setAnnouncement(`${enter.count} past buys fit. Keep typing to pick one`));
      typingHint.show(`${enter.count} fit · keep typing`);
    }
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
      <BuyAgainQuickAddCard
        name={parsedQuery.name}
        quantity={parsedQuery.quantity}
        existing={typedOnList}
        listName={listName}
        enterTarget={enterAddsTyped}
        onAdd={() => quickAddParsed(parsedQuery)}
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

      <BuyAgainSearchBar
        searchRef={searchRef}
        query={query}
        trimmedQuery={trimmedQuery}
        typingHint={typingHint.value}
        listName={listName}
        hasOtherLists={catalog.hasOtherLists}
        includeOtherLists={includeOtherLists}
        onQueryChange={(value) => {
          lockHeightIfNeeded();
          // New results start at the top, where the best matches are
          if (value.trim() !== trimmedQuery && bodyRef.current) bodyRef.current.scrollTop = 0;
          setQuery(value);
          typingHint.clear();
        }}
        onClearQuery={() => setQuery("")}
        onSubmit={addFromSearch}
        onFocus={() => {
          lockHeightIfNeeded();
          setTouchTyping(window.matchMedia("(pointer: coarse)").matches);
        }}
        onBlur={() => setTouchTyping(false)}
        onSelectScope={(next) => {
          if (bodyRef.current) bodyRef.current.scrollTop = 0;
          setIncludeOtherLists(next);
        }}
      />

      <div
        ref={bodyRef}
        tabIndex={-1}
        aria-busy={loadingList || undefined}
        className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pb-4 outline-none"
      >
        <BuyAgainCatalog
          loadingList={loadingList}
          catalog={catalog}
          listName={listName}
          trimmedQuery={trimmedQuery}
          includeOtherLists={includeOtherLists}
          runningLowCollapsed={runningLowCollapsed}
          runningLowToAddCount={toAdd.length}
          bulkUndo={bulkUndo}
          bulkUndoActive={bulkUndoActive}
          addTypedCard={addTypedCard}
          addTypedAtTop={enter?.kind === "add"}
          now={now}
          viewerId={viewer.id}
          openByKey={openByKey}
          statusOf={statusOf}
          hintedKey={hinted.value}
          freshKey={fresh.value}
          enterKey={enterKey}
          editing={editing}
          pendingHideKeys={pendingHides}
          collapsingHideKeys={collapsingHides}
          typedQuantity={parsedQuery?.quantity ?? null}
          onShowAllLists={() => setIncludeOtherLists(true)}
          onExpandRunningLow={expandRunningLow}
          onAddAllRunningLow={addAllRunningLow}
          onToggleRow={(entry) => toggleRow(entry, parsedQuery?.quantity ?? null)}
          onStepQuantity={stepRowQuantity}
          onHideRow={scheduleHide}
          onUndoHideRow={undoHide}
        />
      </div>

      {/* Always mounted, so screen readers hear each change of its text */}
      <p aria-live="polite" className="sr-only">
        {announcement}
      </p>

      <BuyAgainFooter
        undoBar={undoBar}
        lastUndoBar={lastUndoBar}
        undoBarRef={undoBarRef}
        showFooter={showFooter}
        openCount={openCount}
        listName={listName}
        ready={ready}
      />
    </div>
  );
}
