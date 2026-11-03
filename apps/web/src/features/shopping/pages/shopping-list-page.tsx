import { getRouteApi } from "@tanstack/react-router";

import { BackLink } from "@/components/back-link.tsx";
import { CollapsibleGroup } from "@/components/layout/collapsible-group.tsx";
import { Group } from "@/components/layout/group.tsx";
import { PageHeading } from "@/components/layout/page-heading.tsx";
import { Button } from "@/components/ui/button";

import { AddRow } from "@/components/add-row.tsx";
import { DeleteListButton } from "../components/delete-list-button.tsx";
import { ListNotFound } from "../components/list-not-found.tsx";
import { RenameListButton } from "../components/rename-list-button.tsx";
import { SharedWithLine } from "@/components/shared-with-line.tsx";
import { ShoppingItemRow } from "../components/shopping-item-row.tsx";
import { useSettlingItems } from "../hooks/use-settling-items.ts";
import { useShoppingList } from "../hooks/use-shopping-list.ts";
import { byCategory, groupItems } from "../shopping-items.ts";

const routeApi = getRouteApi("/_household/lists/$listId");

export function ShoppingListPage({ otherMembers }: { otherMembers: string[] }) {
  const { listId } = routeApi.useParams();
  const { user } = routeApi.useRouteContext();
  const { list, gone, add, toggle, remove, clearChecked } = useShoppingList(listId, user);
  const { settling, touched, listRef } = useSettlingItems();

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
    <ShoppingItemRow key={item.id} settling={settling.has(item.id)} {...rowProps(item)} />
  );

  return (
    <>
      <BackLink to="/lists" label="Shopping" />
      <PageHeading title={list.name}>
        <SharedWithLine otherMembers={otherMembers} />
      </PageHeading>

      <Group className="mt-6">
        <AddRow label="Add item" withQuantity maxLength={100} onAdd={add} />
        {open.length > 0 ? (
          <div ref={listRef} className="divide-y">
            {(sections ?? [{ category: null, items: open }]).map(({ category, items }) => (
              // One card for the whole list, with a slim heading per category. Each part folds
              // away as one when everything in it is ticked off (see useSettlingItems).
              <section
                key={category ?? "all"}
                aria-label={category ?? "To buy"}
                data-settle-group
                className="overflow-hidden"
              >
                {category && (
                  <h2 className="bg-muted/50 px-4 py-2 text-[0.8125rem] font-medium text-muted-foreground">
                    {category}
                  </h2>
                )}
                <ul className="divide-y">{items.map(row)}</ul>
              </section>
            ))}
          </div>
        ) : (
          <p className="px-4 py-10 text-center text-sm text-muted-foreground">
            {checked.length > 0
              ? "Everything's in the cart."
              : "Nothing to buy. Add the first item."}
          </p>
        )}
      </Group>

      {checked.length > 0 && (
        <CollapsibleGroup
          label="In cart"
          count={checked.length}
          action={
            <Button className="h-11 px-5" onClick={clearChecked}>
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

      <div className="mt-12 flex flex-wrap gap-x-6 gap-y-2">
        <RenameListButton list={list} />
        <DeleteListButton list={list} />
      </div>
    </>
  );
}
