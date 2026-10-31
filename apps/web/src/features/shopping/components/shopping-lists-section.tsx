import { CaretRightIcon } from "@phosphor-icons/react";
import { useSuspenseQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";

import { listsQuery } from "../shopping.queries.ts";
import { NewListForm } from "./new-list-form.tsx";

function progress({ itemCount, openCount }: { itemCount: number; openCount: number }) {
  if (itemCount === 0) return "Empty";
  if (openCount === 0) return "All checked off";
  return `${openCount} to buy`;
}

/** The household's shopping lists, for the dashboard */
export function ShoppingListsSection() {
  const { data: lists } = useSuspenseQuery(listsQuery());

  return (
    <section>
      <h2 className="mb-3 text-sm font-medium">Shopping lists</h2>
      {lists.length > 0 ? (
        <ul className="mb-3 divide-y rounded-xl border">
          {lists.map((list) => (
            <li key={list.id}>
              <Link
                to="/lists/$listId"
                params={{ listId: list.id }}
                className="flex min-h-14 items-center gap-3 rounded-xl px-4 py-2.5 outline-none hover:bg-muted/50 focus-visible:ring-3 focus-visible:ring-ring/50"
              >
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">{list.name}</span>
                  <span className="block text-sm text-muted-foreground">{progress(list)}</span>
                </span>
                <CaretRightIcon className="size-4 text-muted-foreground" />
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mb-3 text-sm text-muted-foreground">
          No lists yet. Start one for your next shop.
        </p>
      )}
      <NewListForm suggestion={lists.length === 0 ? "Groceries" : undefined} />
    </section>
  );
}
