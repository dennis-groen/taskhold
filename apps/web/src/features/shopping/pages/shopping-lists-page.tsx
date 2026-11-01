import { CaretRightIcon } from "@phosphor-icons/react";
import { useSuspenseQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";

import { Group } from "@/components/layout/group.tsx";
import { PageHeading } from "@/components/layout/page-heading.tsx";

import { NewListForm } from "../components/new-list-form.tsx";
import { SharedWithLine } from "@/components/shared-with-line.tsx";
import { listsQuery } from "../shopping.queries.ts";

function progress({ itemCount, openCount }: { itemCount: number; openCount: number }) {
  if (itemCount === 0) return "Empty";
  if (openCount === 0) return "All in the cart";
  return `${openCount} to buy`;
}

/** All of the household's shopping lists */
export function ShoppingListsPage({ otherMembers }: { otherMembers: string[] }) {
  const { data: lists } = useSuspenseQuery(listsQuery());

  return (
    <>
      <PageHeading title="Shopping">
        <SharedWithLine otherMembers={otherMembers} />
      </PageHeading>

      <Group className="mt-6">
        <NewListForm />
        {lists.length === 0 ? (
          <p className="px-4 py-10 text-center text-sm text-muted-foreground">
            No lists yet. Start one for your next shop, like Groceries.
          </p>
        ) : (
          <ul className="divide-y">
            {lists.map((list) => (
              <li key={list.id}>
                <Link
                  to="/lists/$listId"
                  params={{ listId: list.id }}
                  className="flex min-h-13 items-center gap-3 px-4 py-3 outline-none hover:bg-muted/50 focus-visible:bg-muted/50"
                >
                  <span className="min-w-0 flex-1 truncate text-base">{list.name}</span>
                  <span className="shrink-0 text-sm text-muted-foreground tabular-nums">
                    {progress(list)}
                  </span>
                  <CaretRightIcon className="size-4 shrink-0 text-muted-foreground" />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Group>
    </>
  );
}
