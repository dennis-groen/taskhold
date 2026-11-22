import { useState } from "react";
import { getRouteApi, useNavigate } from "@tanstack/react-router";

import { BackLink } from "@/components/BackLink.tsx";
import { BasketIcon, CheckCircleIcon, ConfettiIcon } from "@/components/icons.ts";
import { CompactHeader } from "@/components/layout/AreaHeader.tsx";
import { EmptyState } from "@/components/layout/EmptyState.tsx";
import { Button } from "@/components/ui/button";
import { useWaitingVars } from "@/lib/offline-changes.ts";
import { useSettlingItems } from "@/lib/use-settling-items.ts";

import type { Category } from "../categories.ts";
import type { ShoppingItem } from "../shopping.api.ts";
import { shoppingChanges, type ItemChanges } from "../shopping.changes.ts";
import { namesOf, useShoppingList } from "../shopping.hooks.ts";
import {
  byCategory,
  groupItems,
  reconcileFolds,
  sameCategories,
  type FoldState,
} from "../shopping-items.ts";
import { CategorySection } from "./CategorySection.tsx";
import { EditItemSheet } from "./EditItemSheet.tsx";
import { ListMenu } from "./ListMenu.tsx";
import { ListNotFound } from "./ListNotFound.tsx";
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
  const unsynced = new Set(useWaitingVars(shoppingChanges.toggle).map((vars) => vars.itemId));
  // The item open in the edit sheet. Looked up on each render, so the sheet closes by itself if a
  // housemate removes the item while it's open.
  const [editingId, setEditingId] = useState<string | null>(null);
  // Set by "Clear ticked", so the empty list congratulates instead of asking for a first item
  const [finished, setFinished] = useState(false);

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
            beforeDelete={async () => {
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

      {list.items.length > 0 ? (
        <div key={listId} className="mt-3 space-y-3 lg:mt-4 lg:space-y-4">
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
      ) : (
        <EmptyState className="mt-6" icon={finished ? ConfettiIcon : BasketIcon}>
          {finished ? "Shopping done. Nice one." : "Nothing to get. Add the first item below."}
        </EmptyState>
      )}

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
    </>
  );
}
