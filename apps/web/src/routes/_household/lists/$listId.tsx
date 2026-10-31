import { createFileRoute, notFound } from "@tanstack/react-router";

import { ListNotFound } from "@/features/shopping/components/list-not-found.tsx";
import { ShoppingListPage } from "@/features/shopping/pages/shopping-list-page.tsx";
import { isListGone, listQuery } from "@/features/shopping/shopping.queries.ts";

export const Route = createFileRoute("/_household/lists/$listId")({
  loader: async ({ context, params }) => {
    try {
      await context.queryClient.ensureQueryData(listQuery(params.listId));
    } catch (err) {
      if (isListGone(err)) throw notFound();
      throw err;
    }
  },
  notFoundComponent: ListNotFound,
  component: ShoppingListPage,
});
