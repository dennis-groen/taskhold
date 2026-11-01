import { CaretRightIcon } from "@phosphor-icons/react";
import { getRouteApi } from "@tanstack/react-router";
import { useState } from "react";

import { BackLink } from "@/components/back-link.tsx";
import { Group } from "@/components/layout/group.tsx";
import { PageHeading } from "@/components/layout/page-heading.tsx";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

import { AddRow } from "@/components/add-row.tsx";
import { DeleteListButton } from "../components/delete-list-button.tsx";
import { ListNotFound } from "../components/list-not-found.tsx";
import { SharedWithLine } from "@/components/shared-with-line.tsx";
import { ShoppingItemRow } from "../components/shopping-item-row.tsx";
import { useShoppingList } from "../hooks/use-shopping-list.ts";
import { groupItems } from "../shopping-items.ts";

const routeApi = getRouteApi("/_household/lists/$listId");

export function ShoppingListPage({ otherMembers }: { otherMembers: string[] }) {
  const { listId } = routeApi.useParams();
  const { user } = routeApi.useRouteContext();
  const { list, gone, add, toggle, remove, clearChecked } = useShoppingList(listId, user);
  const [cartOpen, setCartOpen] = useState(false);

  if (gone) return <ListNotFound />;

  const { open, checked } = groupItems(list.items);
  const rowProps = (item: (typeof list.items)[number]) => ({
    item,
    viewerId: user.id,
    onToggle: (isChecked: boolean) => toggle(item.id, isChecked),
    onRemove: () => remove(item.id),
  });

  return (
    <>
      <BackLink to="/lists" label="Shopping" />
      <PageHeading title={list.name}>
        <SharedWithLine otherMembers={otherMembers} />
      </PageHeading>

      <Group className="mt-6">
        <AddRow label="Add item" withQuantity maxLength={100} onAdd={add} />
        {open.length > 0 ? (
          <ul aria-label="To buy" className="divide-y">
            {open.map((item) => (
              <ShoppingItemRow key={item.id} {...rowProps(item)} />
            ))}
          </ul>
        ) : (
          <p className="px-4 py-10 text-center text-sm text-muted-foreground">
            {checked.length > 0
              ? "Everything's in the cart."
              : "Nothing to buy. Add the first item."}
          </p>
        )}
      </Group>

      {checked.length > 0 && (
        <section className="mt-6" aria-label="In cart">
          <div className="flex items-center justify-between gap-2">
            <Button
              variant="ghost"
              aria-expanded={cartOpen}
              onClick={() => setCartOpen((isOpen) => !isOpen)}
              className="-ml-2 h-11 px-2 text-muted-foreground"
            >
              <CaretRightIcon className={cn("transition-transform", cartOpen && "rotate-90")} />
              In cart ({checked.length})
            </Button>
            <Button className="h-11 px-5" onClick={clearChecked}>
              Done shopping
            </Button>
          </div>
          {cartOpen && (
            <Group className="mt-2">
              <ul className="divide-y">
                {checked.map((item) => (
                  <ShoppingItemRow key={item.id} {...rowProps(item)} />
                ))}
              </ul>
            </Group>
          )}
        </section>
      )}

      <div className="mt-12">
        <DeleteListButton list={list} />
      </div>
    </>
  );
}
