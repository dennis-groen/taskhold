import type { ReactNode } from "react";

import {
  ArrowCounterClockwiseIcon,
  CaretDownIcon,
  CheckIcon,
  ClockIcon,
} from "@/components/icons.ts";
import { Button } from "@/components/ui/button";
import { cn } from "cn";

import type { BuyAgainCatalog as CatalogData, BuyAgainCatalogItem } from "../buy-again.ts";
import type { BulkUndo } from "../buy-again-sheet.hooks.ts";
import { CATEGORY_ICONS } from "../category-icons.ts";
import { itemKey } from "../item-entry.ts";
import type { ShoppingItem } from "../shopping.api.ts";
import { BuyAgainCatalogRow } from "./BuyAgainCatalogRow.tsx";

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
 * Scrollable catalog body of the Buy again sheet: loading skeleton, empty states, the collapsible
 * "Running low" card with bulk add/undo, and supermarket aisle cards with pinned headers.
 */
export function BuyAgainCatalog({
  loadingList,
  catalog,
  listName,
  trimmedQuery,
  includeOtherLists,
  runningLowCollapsed,
  runningLowToAddCount,
  bulkUndo,
  bulkUndoActive,
  addTypedCard,
  addTypedAtTop,
  now,
  viewerId,
  openByKey,
  statusOf,
  hintedKey,
  freshKey,
  enterKey,
  editing,
  pendingHideKeys,
  collapsingHideKeys,
  typedQuantity,
  onShowAllLists,
  onExpandRunningLow,
  onAddAllRunningLow,
  onToggleRow,
  onStepQuantity,
  onHideRow,
  onUndoHideRow,
}: {
  loadingList: boolean;
  catalog: CatalogData;
  listName: string;
  trimmedQuery: string;
  includeOtherLists: boolean;
  runningLowCollapsed: boolean;
  runningLowToAddCount: number;
  bulkUndo: BulkUndo | null;
  bulkUndoActive: boolean;
  addTypedCard: ReactNode;
  addTypedAtTop: boolean;
  now: Temporal.Instant;
  viewerId: string;
  openByKey: ReadonlyMap<string, ShoppingItem>;
  /** Whether this visit added or unticked it (see list-entry.ts) */
  statusOf: (name: string) => "added" | "unticked" | null;
  hintedKey: string | null;
  freshKey: string | null;
  enterKey: string | null;
  editing: boolean;
  pendingHideKeys: Record<string, unknown>;
  collapsingHideKeys: Record<string, true>;
  typedQuantity: string | null;
  onShowAllLists: () => void;
  onExpandRunningLow: () => void;
  onAddAllRunningLow: () => void;
  onToggleRow: (entry: BuyAgainCatalogItem) => void;
  onStepQuantity: (item: ShoppingItem, delta: 1 | -1) => void;
  onHideRow: (entry: BuyAgainCatalogItem) => void;
  onUndoHideRow: (key: string) => void;
}) {
  if (loadingList) {
    return (
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
    );
  }

  if (catalog.total === 0) {
    if (addTypedCard) {
      return (
        <div className="space-y-3 pt-3">
          <p className="px-1 text-sm text-muted-foreground">
            Nothing bought before matching &ldquo;{trimmedQuery}&rdquo;.
          </p>
          {addTypedCard}
        </div>
      );
    }
    return (
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
              onClick={onShowAllLists}
              className="font-semibold text-area-fg underline-offset-4 hover:underline"
            >
              Show all lists
            </button>
          </>
        )}
      </p>
    );
  }

  function renderRow(entry: BuyAgainCatalogItem) {
    const key = itemKey(entry.name);
    const listItem = openByKey.get(key);
    return (
      <BuyAgainCatalogRow
        key={entry.name}
        entry={entry}
        now={now}
        viewerId={viewerId}
        listItem={listItem}
        addedHere={listItem !== undefined && statusOf(entry.name) === "added"}
        untickedHere={listItem !== undefined && statusOf(entry.name) === "unticked"}
        hinted={hintedKey === key}
        fresh={freshKey === key}
        enterTarget={enterKey === key}
        editing={editing}
        pendingHide={key in pendingHideKeys}
        collapsing={key in collapsingHideKeys}
        typedQuantity={typedQuantity}
        onToggle={() => onToggleRow(entry)}
        onStep={onStepQuantity}
        onHide={() => onHideRow(entry)}
        onUndoHide={() => onUndoHideRow(key)}
      />
    );
  }

  return (
    <div className="space-y-3 pt-1">
      {addTypedAtTop && addTypedCard}
      {catalog.runningLow.length > 0 && runningLowCollapsed && (
        <section aria-labelledby="buy-again-running-low-heading" className={SHEET_CARD}>
          <button
            type="button"
            aria-expanded={false}
            onClick={onExpandRunningLow}
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
                id="buy-again-running-low-heading"
                className="truncate text-[0.9375rem] font-[780] tracking-[-0.01em] [font-stretch:112%]"
              >
                Running low
              </h3>
              <span className="block truncate text-xs text-muted-foreground">
                {catalog.runningLow.length === 1
                  ? `It's already on ${listName}`
                  : `All ${catalog.runningLow.length} are already on ${listName}`}
              </span>
            </span>
            <span className="flex shrink-0 items-center gap-1 text-sm font-semibold text-muted-foreground">
              Show
              <CaretDownIcon aria-hidden weight="bold" className="size-3.5" />
            </span>
          </button>
        </section>
      )}
      {catalog.runningLow.length > 0 && !runningLowCollapsed && (
        <section aria-labelledby="buy-again-running-low-heading" className={SHEET_CARD}>
          <StickyCardHead>
            <div className={cn(STICKY_CARD_HEAD_INNER, "gap-2")}>
              <h3
                id="buy-again-running-low-heading"
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
              {!editing && (bulkUndo || runningLowToAddCount >= 2) && (
                <Button
                  type="button"
                  variant="soft"
                  size="sm"
                  data-add-running-low
                  aria-label={
                    bulkUndo && bulkUndoActive
                      ? `Undo adding ${bulkUndo.count} to ${listName}`
                      : undefined
                  }
                  onClick={bulkUndo && bulkUndoActive ? bulkUndo.undo : onAddAllRunningLow}
                  className="h-9 gap-1.5 rounded-full px-3.5 font-[700] tabular-nums after:-inset-y-1"
                >
                  {bulkUndoActive ? (
                    <>
                      <ArrowCounterClockwiseIcon aria-hidden weight="bold" className="size-4" />
                      Undo
                    </>
                  ) : (
                    `Add all ${Math.max(runningLowToAddCount, bulkUndo?.count ?? 0)}`
                  )}
                </Button>
              )}
            </div>
          </StickyCardHead>
          <ul>{catalog.runningLow.map(renderRow)}</ul>
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
            <ul>{items.map(renderRow)}</ul>
          </section>
        );
      })}
      {!addTypedAtTop && addTypedCard}
    </div>
  );
}
