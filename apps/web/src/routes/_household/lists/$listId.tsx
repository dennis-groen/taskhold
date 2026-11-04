import { createFileRoute, getRouteApi, notFound } from "@tanstack/react-router";

import { ListNotFound } from "@/features/shopping/components/list-not-found.tsx";
import { ShoppingListPage } from "@/features/shopping/pages/shopping-list-page.tsx";
import { isListGone, listQuery } from "@/features/shopping/shopping.queries.ts";
import { otherHousemates } from "@/lib/shared-with.ts";

const householdRoute = getRouteApi("/_household");

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
  component: ListRoute,
});

function ListRoute() {
  const household = householdRoute.useLoaderData();
  const { user } = householdRoute.useRouteContext();
  return <ShoppingListPage otherMembers={otherHousemates(household.members, user.id)} />;
}
