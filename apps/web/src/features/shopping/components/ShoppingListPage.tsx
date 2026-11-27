import { useState } from "react";
import { getRouteApi, useNavigate } from "@tanstack/react-router";

import { BackLink } from "@/components/BackLink.tsx";
import {
  BasketIcon,
  CaretRightIcon,
  CheckCircleIcon,
  CheckIcon,
  ClockCounterClockwiseIcon,
  ConfettiIcon,
  PlusIcon,
} from "@/components/icons.ts";
import { CompactHeader } from "@/components/layout/AreaHeader.tsx";
import { EmptyState } from "@/components/layout/EmptyState.tsx";
import { Button } from "@/components/ui/button";
import { useSettlingItems } from "@/lib/use-settling-items.ts";
import { cn } from "cn";

import type { Category } from "../categories.ts";
import type { ShoppingItem } from "../shopping.api.ts";
import type { ItemChanges } from "../shopping.changes.ts";
import {
  namesOf,
  useBuyAgainFor,
  useBuyAgainHistoryCount,
  usePendingToggleIds,
  useShoppingList,
} from "../shopping.hooks.ts";
import {
  byCategory,
  groupItems,
  reconcileFolds,
  sameCategories,
  type FoldState,
} from "../shopping-items.ts";
import { offerUndoAll, useListEntry } from "../list-entry.hooks.ts";
import { BuyAgainSheet } from "./BuyAgainSheet.tsx";
import { CategorySection } from "./CategorySection.tsx";
import { EditItemSheet } from "./EditItemSheet.tsx";
import { ListMenu } from "./ListMenu.tsx";
import { ListNotFound } from "./ListNotFound.tsx";
import { ShoppingTripBar } from "./ShoppingTripBar.tsx";
import { ShoppingItemRow } from "./ShoppingItemRow.tsx";

const routeApi = getRouteApi("/_household/lists/$listId");

/**
 * One list, made for the aisle: a compact bar keeps rows on screen, each supermarket section
 * sits in its own card, and the tick is on the right under the thumb. A ticked item sinks to the
 * bottom of its card, and once every item in a section is ticked and settled the card folds to
 * its header so remaining aisles rise up. Adding happens in the dock's field below.
 */
export function ShoppingListPage() {
  const { listId } = routeApi.useParams();
  const { user } = routeApi.useRouteContext();
  const navigate = useNavigate();
  const { list, gone, toggle, edit, remove, clearChecked } = useShoppingList(listId, user);
  // Ticks stay where they are for a moment, so a wrong one can be taken back in place. No list
  // ref: rows don't fold away, they move down their own section and completed cards fold once quiet.
  const { settling, touched } = useSettlingItems();
  // Ticks saved here and not yet synced, so their mark can say so
  const unsynced = usePendingToggleIds();
  // The item open in the edit sheet. Looked up on each render, so the sheet closes by itself if a
  // housemate removes the item while it's open.
  const [editingId, setEditingId] = useState<string | null>(null);
  // Set by "Clear ticked", so the empty list congratulates instead of asking for a first item
  const [finished, setFinished] = useState(false);
  const [restockOpen, setRestockOpen] = useState(false);
  const listEntry = useListEntry(listId, user);
  const suggestions = useBuyAgainFor(listId).offer("", listEntry.addedIds);
  const historyCount = useBuyAgainHistoryCount();
  // Keep the empty-list launchpad open while you tap several items in a row, instead of vanishing
  // after the first tap. Also re-arms if a list empties while open, and resets when switching lists.
  const [launchpadState, setLaunchpadState] = useState(() => ({
    listId,
    open: list.items.length === 0,
  }));
  if (launchpadState.listId !== listId) {
    setLaunchpadState({ listId, open: list.items.length === 0 });
  } else if (list.items.length === 0 && !finished && !launchpadState.open) {
    setLaunchpadState({ listId, open: true });
  }
  const showLaunchpad =
    !finished && historyCount > 0 && (list.items.length === 0 || launchpadState.open);

  const sections = (byCategory(list.items) ?? [{ category: null, items: list.items }]).map(
    ({ category, items }) => {
      const { open, checked } = groupItems(items, settling);
      return {
        category,
        items: [...open, ...checked],
        left: open.filter((i) => !i.checked).length,
      };
    },
  );
  const allDone = new Set<Category>(
    sections.flatMap(({ category, items }) =>
      category !== null && items.length > 0 && items.every((item) => item.checked)
        ? [category]
        : [],
    ),
  );
  const quiet = settling.size === 0;
  // Seeded from `allDone` so a list opened with finished aisles starts folded with no flash.
  const [foldTracking, setFoldTracking] = useState<{ listId: string; state: FoldState }>(() => ({
    listId,
    state: { folded: allDone, peeked: new Set() },
  }));
  const currentFolds: FoldState =
    foldTracking.listId === listId
      ? foldTracking.state
      : { folded: allDone, peeked: new Set<Category>() };
  const nextFolds = reconcileFolds(currentFolds, allDone, quiet);
  if (
    foldTracking.listId !== listId ||
    !sameCategories(currentFolds.folded, nextFolds.folded) ||
    !sameCategories(currentFolds.peeked, nextFolds.peeked)
  ) {
    setFoldTracking({ listId, state: nextFolds });
  }

  if (gone) return <ListNotFound />;

  const editing = list.items.find((item) => item.id === editingId) ?? null;
  const ticked = list.items.filter((item) => item.checked);
  const left = list.items.length - ticked.length;

  function toggleFold(category: Category) {
    setFoldTracking((prev) => {
      const base = prev.listId === listId ? prev.state : nextFolds;
      const folded = new Set(base.folded);
      const peeked = new Set(base.peeked);
      if (folded.has(category)) {
        folded.delete(category);
        peeked.add(category);
      } else {
        peeked.delete(category);
        if (allDone.has(category)) folded.add(category);
      }
      return { listId, state: { folded, peeked } };
    });
  }

  const rowProps = (item: ShoppingItem) => ({
    item,
    unsynced: unsynced.has(item.id),
    viewerId: user.id,
    onToggle: (isChecked: boolean) => {
      touched(item.id);
      toggle(item.id, isChecked);
    },
    onEdit: () => setEditingId(item.id),
  });

  function saveEdit(item: ShoppingItem, changes: ItemChanges) {
    if (changes.name === undefined && changes.quantity === undefined) return;
    edit(item.id, changes);
  }

  return (
    <>
      <CompactHeader
        back={<BackLink to="/lists" label="Lists" onSlab />}
        title={list.name}
        right={
          <ListMenu
            list={{ id: list.id, name: list.name, itemCount: list.items.length }}
            onSlab
            leaveList={async () => {
              await navigate({ to: "/lists" });
            }}
          />
        }
        meta={
          <>
            <span>
              <b className="text-count mr-[3px] text-base">{left}</b> to get
            </span>
            <span>
              <b className="text-count mr-[3px] text-base">{ticked.length}</b> ticked
            </span>
          </>
        }
        meter={{ done: ticked.length, total: list.items.length }}
      />

      <ShoppingTripBar listId={list.id} viewer={user} items={list.items} />

      <div
        className={cn(
          "grid transition-[grid-template-rows,opacity] duration-240 ease-(--ease-in-out) motion-reduce:transition-none",
          showLaunchpad
            ? "grid-rows-[1fr] opacity-100"
            : "pointer-events-none grid-rows-[0fr] opacity-0",
        )}
      >
        <div className="min-h-0 overflow-hidden" inert={!showLaunchpad}>
          <div className="pt-3 lg:pt-4">
            <EmptyListRestock
              listName={list.name}
              hasItems={list.items.length > 0}
              chips={suggestions.slice(0, 10).map(({ name, quantity }) => ({
                name,
                quantity,
                added: listEntry.status(name) === "added",
              }))}
              onToggleOne={(name, quantity) => {
                listEntry.tap(name, quantity);
              }}
              onAddAll={() => {
                const all = listEntry.putAll(
                  suggestions.slice(0, 10).filter((item) => listEntry.status(item.name) === null),
                );
                offerUndoAll(listEntry, all.outcomes, list.name);
              }}
              onBrowseAll={() => setRestockOpen(true)}
              onDismiss={() => setLaunchpadState({ listId, open: false })}
            />
          </div>
        </div>
      </div>

      {list.items.length > 0 ? (
        <div
          key={listId}
          className="mt-3 space-y-3 transition-[opacity,translate] duration-200 ease-(--ease-out) lg:mt-4 lg:space-y-4 starting:translate-y-1 starting:opacity-0 motion-reduce:transition-none"
        >
          {sections.map(({ category, items, left: sectionLeft }) => {
            const folded = category !== null && nextFolds.folded.has(category);
            const canFold =
              category !== null &&
              (folded || (allDone.has(category) && nextFolds.peeked.has(category)));
            return (
              <CategorySection
                key={category ?? "all"}
                category={category}
                left={sectionLeft}
                total={items.length}
                folded={folded}
                canFold={canFold}
                onToggleFold={() => category && toggleFold(category)}
              >
                {items.map((item) => (
                  <ShoppingItemRow
                    key={item.id}
                    settling={settling.has(item.id)}
                    {...rowProps(item)}
                  />
                ))}
              </CategorySection>
            );
          })}
        </div>
      ) : finished || historyCount === 0 ? (
        <EmptyState className="mt-6" icon={finished ? ConfettiIcon : BasketIcon}>
          {finished ? "Shopping done. Nice one." : "Nothing to get. Add the first item below."}
        </EmptyState>
      ) : null}

      {left === 0 && ticked.length > 0 && (
        <p className="mt-6 flex items-center justify-center gap-1.5 text-sm font-semibold text-muted-foreground">
          <CheckCircleIcon aria-hidden weight="fill" className="size-4 text-area-fg" />
          Everything's in the basket
        </p>
      )}

      {ticked.length > 0 && (
        <div className="mt-6">
          <Button
            size="xl"
            variant="secondary"
            className="w-full"
            onClick={() => {
              clearChecked();
              setFinished(left === 0);
            }}
          >
            Clear {ticked.length} ticked
          </Button>
          <p className="mt-2 px-2 text-center text-[0.8125rem] text-muted-foreground">
            Takes {namesOf(ticked.map((item) => item.name))} off {list.name} for everyone. Buy again
            still remembers them.
          </p>
        </div>
      )}

      <EditItemSheet
        item={editing}
        listName={list.name}
        viewerId={user.id}
        onSave={(changes) => editing && saveEdit(editing, changes)}
        onRemove={() => editing && remove(editing.id)}
        onClose={() => setEditingId(null)}
      />

      <BuyAgainSheet
        open={restockOpen}
        onOpenChange={setRestockOpen}
        listId={listId}
        listName={list.name}
        viewer={user}
      />
    </>
  );
}

/**
 * Empty-list launchpad: lets you kick off a weekly shop right on the canvas with wrapped regulars,
 * a one-tap "Add all" shortcut, or the full aisle-grouped Buy again sheet.
 */
function EmptyListRestock({
  listName,
  hasItems,
  chips,
  onToggleOne,
  onAddAll,
  onBrowseAll,
  onDismiss,
}: {
  listName: string;
  hasItems: boolean;
  chips: readonly { name: string; quantity: string | null; added: boolean }[];
  onToggleOne: (name: string, quantity: string | null) => void;
  onAddAll: () => void;
  onBrowseAll: () => void;
  onDismiss: () => void;
}) {
  const unaddedCount = chips.filter((chip) => !chip.added).length;
  return (
    <section
      aria-labelledby="empty-restock-heading"
      className="rounded-[20px] bg-card p-4 shadow-card"
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2.5">
          <span
            aria-hidden
            className="grid size-8 shrink-0 place-items-center rounded-[10px] bg-area-tint text-area-fg"
          >
            <ClockCounterClockwiseIcon weight="bold" className="size-4" />
          </span>
          <div className="min-w-0">
            <h2
              id="empty-restock-heading"
              className="truncate text-[0.9375rem] font-[780] tracking-[-0.01em] [font-stretch:112%]"
            >
              {chips.length > 0 ? "Buy again" : "Ready to restock?"}
            </h2>
            <p className="truncate text-xs text-muted-foreground">
              {chips.length > 0
                ? `Tap to add to ${listName}, or type below.`
                : "Browse what you've bought before, or type below."}
            </p>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={onBrowseAll}
            className="h-9 gap-1 rounded-full px-3 text-area-fg after:-inset-y-1"
          >
            <span>Browse all</span>
            <CaretRightIcon aria-hidden weight="bold" className="size-3.5" />
          </Button>
          {hasItems && (
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={onDismiss}
              className="h-9 rounded-full px-3.5 font-[700] after:-inset-y-1"
            >
              Done
            </Button>
          )}
        </div>
      </div>

      {chips.length > 0 && (
        <>
          <ul aria-label="Past buys to add" className="mt-3.5 flex flex-wrap gap-2">
            {chips.map(({ name, quantity, added }) => (
              <li key={name}>
                <Button
                  type="button"
                  variant="chip"
                  // One fixed name; "pressed" alone says it's been added
                  aria-pressed={added}
                  aria-label={quantity ? `Add ${quantity} ${name}` : `Add ${name}`}
                  onClick={() => onToggleOne(name, quantity)}
                  className="max-w-60 gap-1.5 pr-4 pl-3 aria-pressed:font-medium active:scale-[0.96] motion-reduce:active:scale-100"
                >
                  {added ? (
                    <CheckIcon
                      weight="bold"
                      aria-hidden
                      className="size-4 shrink-0 text-area-fg animate-[check-pop_220ms_var(--ease-out)] motion-reduce:animate-none"
                    />
                  ) : (
                    <PlusIcon weight="bold" aria-hidden className="size-4 shrink-0 text-area-fg" />
                  )}
                  <span className="truncate">{name}</span>
                  {quantity && (
                    <span
                      className={cn(
                        "max-w-24 shrink-0 truncate text-xs font-semibold tabular-nums",
                        added ? "text-primary-soft-foreground/80" : "text-muted-foreground",
                      )}
                    >
                      · {quantity}
                    </span>
                  )}
                </Button>
              </li>
            ))}
          </ul>

          {unaddedCount >= 2 && (
            <Button
              type="button"
              variant="soft"
              size="lg"
              onClick={onAddAll}
              className="mt-4 w-full rounded-2xl"
            >
              Add these {unaddedCount}
            </Button>
          )}
        </>
      )}
    </section>
  );
}
