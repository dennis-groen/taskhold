import { CaretRightIcon, ListChecksIcon } from "@phosphor-icons/react";
import { useSuspenseQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";

import { EmptyState } from "@/components/layout/EmptyState.tsx";
import { Group } from "@/components/layout/Group.tsx";
import { PageHeading } from "@/components/layout/PageHeading.tsx";
import { cn } from "cn";

import { NewListForm } from "./NewListForm.tsx";
import { SharedWithLine } from "@/components/SharedWithLine.tsx";
import type { Housemate } from "@/lib/shared-with.ts";
import { listsQuery } from "../shopping.queries.ts";

function progress({ itemCount, openCount }: { itemCount: number; openCount: number }) {
  if (itemCount === 0) return "Empty";
  if (openCount === 0) return "All in the cart";
  return `${openCount} to buy`;
}

/** All of the household's shopping lists */
export function ShoppingListsPage({ otherMembers }: { otherMembers: Housemate[] }) {
  const { data: lists } = useSuspenseQuery(listsQuery());

  return (
    <>
      <PageHeading title="Shopping">
        <SharedWithLine otherMembers={otherMembers} />
      </PageHeading>

      <Group className="mt-6">
        <NewListForm />
        {lists.length === 0 ? (
          <EmptyState icon={ListChecksIcon}>
            No lists yet. Start one for your next shop, like Groceries.
          </EmptyState>
        ) : (
          <ul className="divide-y">
            {lists.map((list) => (
              <li key={list.id}>
                <Link
                  to="/lists/$listId"
                  params={{ listId: list.id }}
                  className="group/list flex min-h-15 items-center gap-3 px-4 py-3 outline-none transition-colors hover:bg-muted/40 focus-visible:bg-muted/60 focus-visible:ring-2 focus-visible:ring-ring/80 focus-visible:ring-inset active:bg-muted/70"
                >
                  <span className="min-w-0 flex-1 truncate text-base font-semibold">
                    {list.name}
                  </span>
                  <span
                    className={cn(
                      "shrink-0 rounded-full px-2.5 py-1 text-[0.8125rem] leading-4 font-semibold tabular-nums",
                      list.openCount > 0
                        ? "bg-primary-soft text-primary-soft-foreground"
                        : "bg-muted text-muted-foreground",
                    )}
                  >
                    {progress(list)}
                  </span>
                  <CaretRightIcon
                    weight="bold"
                    className="size-4 shrink-0 text-muted-foreground/70 transition-transform duration-200 ease-out group-hover/list:translate-x-0.5"
                  />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Group>
    </>
  );
}
