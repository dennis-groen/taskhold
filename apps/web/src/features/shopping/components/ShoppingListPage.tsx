import { BasketIcon, CheckCircleIcon, CheckIcon, ConfettiIcon } from "@phosphor-icons/react";
import { useState } from "react";
import { getRouteApi } from "@tanstack/react-router";

import { BackLink } from "@/components/BackLink.tsx";
import { CollapsibleGroup } from "@/components/layout/CollapsibleGroup.tsx";
import { EmptyState } from "@/components/layout/EmptyState.tsx";
import { Group } from "@/components/layout/Group.tsx";
import { PageHeading } from "@/components/layout/PageHeading.tsx";
import { Button } from "@/components/ui/button";

import { AddRow } from "@/components/AddRow.tsx";
import { DeleteListButton } from "./DeleteListButton.tsx";
import { ListNotFound } from "./ListNotFound.tsx";
import { RenameListButton } from "./RenameListButton.tsx";
import { SharedWithLine } from "@/components/SharedWithLine.tsx";
import type { Housemate } from "@/lib/shared-with.ts";
import { ShoppingItemRow } from "./ShoppingItemRow.tsx";
import { useSettlingItems } from "@/lib/use-settling-items.ts";
import { useShoppingList } from "../shopping.hooks.ts";
import { CATEGORY_ICONS } from "../category-icons.ts";
import { categorize } from "../categories.ts";
import { byCategory, groupItems } from "../shopping-items.ts";

const routeApi = getRouteApi("/_household/lists/$listId");

export function ShoppingListPage({ otherMembers }: { otherMembers: Housemate[] }) {
  const { listId } = routeApi.useParams();
  const { user } = routeApi.useRouteContext();
  const { list, gone, add, toggle, remove, clearChecked } = useShoppingList(listId, user);
  const { settling, touched, listRef } = useSettlingItems();
  // The item just added here, so it can light up, and what to tell screen readers about it
  const [fresh, setFresh] = useState<{ id: string; message: string } | null>(null);
  // Set by "Done shopping", so the empty list congratulates instead of asking for a first item
  const [finished, setFinished] = useState(false);

  if (gone) return <ListNotFound />;

  const { open, checked } = groupItems(list.items, settling);
  const sections = byCategory(open);
  const rowProps = (item: (typeof list.items)[number]) => ({
    item,
    viewerId: user.id,
    onToggle: (isChecked: boolean) => {
      touched(item.id);
      toggle(item.id, isChecked);
    },
    onRemove: () => remove(item.id),
  });
  const row = (item: (typeof list.items)[number]) => (
    <ShoppingItemRow
      key={item.id}
      settling={settling.has(item.id)}
      fresh={item.id === fresh?.id}
      {...rowProps(item)}
    />
  );

  function addItem(name: string, quantity: string | null) {
    const id = add(name, quantity);
    const category = categorize(name);
    setFinished(false);
    setFresh({
      id,
      message: category === "Other" ? `Added ${name}` : `Added ${name} to ${category}`,
    });
  }

  return (
    <>
      <BackLink to="/lists" label="Shopping" />
      <PageHeading title={list.name}>
        <SharedWithLine otherMembers={otherMembers} />
      </PageHeading>

      <Group className="mt-6">
        <AddRow label="Add item" withQuantity maxLength={100} onAdd={addItem} />
        {/* Says where the item went: sorting can put it below the fold, and the field keeps focus */}
        <p aria-live="polite" className="empty:hidden">
          {fresh && (
            <span
              key={fresh.id}
              className="flex items-center gap-1.5 px-4 py-2 text-[0.8125rem] font-medium text-primary-soft-foreground animate-in fade-in duration-200"
            >
              <CheckIcon className="size-3.5" weight="bold" aria-hidden />
              {fresh.message}
            </span>
          )}
        </p>
        {open.length > 0 ? (
          <div ref={listRef} className="divide-y">
            {(sections ?? [{ category: null, items: open }]).map(({ category, items }) => (
              // One card for the whole list, with a slim heading per category. Each part folds
              // away as one when everything in it is ticked off (see lib/use-settling-items.ts).
              <section
                key={category ?? "all"}
                aria-label={category ?? "To buy"}
                data-settle-group
                className="overflow-hidden"
              >
                {category && <CategoryHeading category={category} />}
                <ul className="divide-y">{items.map(row)}</ul>
              </section>
            ))}
          </div>
        ) : (
          <EmptyState
            icon={checked.length > 0 ? CheckCircleIcon : finished ? ConfettiIcon : BasketIcon}
          >
            {checked.length > 0
              ? "Everything's in the cart."
              : finished
                ? "Shopping done. Nice one."
                : "Nothing to buy. Add the first item."}
          </EmptyState>
        )}
      </Group>

      {checked.length > 0 && (
        <CollapsibleGroup
          label="In cart"
          count={checked.length}
          action={
            <Button
              size="lg"
              onClick={() => {
                clearChecked();
                setFinished(open.length === 0);
              }}
            >
              Done shopping
            </Button>
          }
        >
          <ul className="divide-y">
            {checked.map((item) => (
              <ShoppingItemRow key={item.id} {...rowProps(item)} />
            ))}
          </ul>
        </CollapsibleGroup>
      )}

      <div className="mt-10 flex flex-wrap gap-x-2 gap-y-2 border-t border-border/70 pt-4">
        <RenameListButton list={list} />
        <DeleteListButton list={list} />
      </div>
    </>
  );
}

function CategoryHeading({ category }: { category: keyof typeof CATEGORY_ICONS }) {
  const CategoryIcon = CATEGORY_ICONS[category];
  return (
    <h2 className="flex items-center gap-2 bg-muted/45 px-4 pt-2.5 pb-2 text-[0.8125rem] leading-4 font-semibold text-muted-foreground">
      <CategoryIcon
        className="size-4 text-primary-soft-foreground/80"
        weight="duotone"
        aria-hidden
      />
      {category}
    </h2>
  );
}
