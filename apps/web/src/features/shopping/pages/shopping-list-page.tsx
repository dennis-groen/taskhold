import { getRouteApi } from "@tanstack/react-router";

import { BackLink } from "@/components/back-link.tsx";
import { PageHeading } from "@/components/layout/page-heading.tsx";
import { Button } from "@/components/ui/button";

import { AddItemForm } from "../components/add-item-form.tsx";
import { DeleteListButton } from "../components/delete-list-button.tsx";
import { ListNotFound } from "../components/list-not-found.tsx";
import { ShoppingItemRow } from "../components/shopping-item-row.tsx";
import { useShoppingList } from "../hooks/use-shopping-list.ts";
import { groupItems } from "../shopping-items.ts";

const routeApi = getRouteApi("/_household/lists/$listId");

export function ShoppingListPage() {
  const { listId } = routeApi.useParams();
  const { user } = routeApi.useRouteContext();
  const { list, gone, error, add, toggle, remove, clearChecked } = useShoppingList(listId, user);

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
      <BackLink to="/dashboard" />
      <PageHeading title={list.name}>
        {list.items.length === 0
          ? "Add what you need. Everyone in your household sees changes within a few seconds."
          : open.length === 0
            ? "Everything's checked off."
            : `${open.length} to buy.`}
      </PageHeading>

      <div className="mt-8">
        <AddItemForm onAdd={add} />
        {error && (
          <p role="alert" className="mt-2 text-sm text-destructive">
            {error}
          </p>
        )}
      </div>

      {open.length > 0 && (
        <ul aria-label="To buy" className="mt-4 divide-y rounded-xl border">
          {open.map((item) => (
            <ShoppingItemRow key={item.id} {...rowProps(item)} />
          ))}
        </ul>
      )}

      {checked.length > 0 && (
        <section className="mt-8">
          <div className="mb-3 flex items-center justify-between gap-4">
            <h2 className="text-sm font-medium">Checked off</h2>
            <Button variant="ghost" size="sm" className="-mr-2.5" onClick={clearChecked}>
              Clear checked off
            </Button>
          </div>
          <ul aria-label="Checked off" className="divide-y rounded-xl border">
            {checked.map((item) => (
              <ShoppingItemRow key={item.id} {...rowProps(item)} />
            ))}
          </ul>
        </section>
      )}

      <div className="mt-12 border-t pt-6">
        <DeleteListButton list={list} />
      </div>
    </>
  );
}
