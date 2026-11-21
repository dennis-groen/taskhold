import { createFileRoute, notFound } from "@tanstack/react-router";

import { ListNotFound } from "@/features/shopping/components/ListNotFound.tsx";
import { ShoppingListPage } from "@/features/shopping/components/ShoppingListPage.tsx";
import { isListGone, listQuery } from "@/features/shopping/shopping.queries.ts";

// List ids are UUIDs. Anything else in the link (e.g. "<id>%3F") isn't a list.
const LIST_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const Route = createFileRoute("/_household/lists/$listId")({
  loader: async ({ context, params }) => {
    if (!LIST_ID.test(params.listId)) throw notFound();
    try {
      await context.queryClient.ensureQueryData(listQuery(params.listId));
    } catch (err) {
      if (isListGone(err)) throw notFound();
      throw err;
    }
  },
  notFoundComponent: ListNotFound,
  component: ListRoute,
});

function ListRoute() {
  return <ShoppingListPage />;
}
