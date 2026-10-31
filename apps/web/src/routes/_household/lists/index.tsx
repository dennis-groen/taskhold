import { createFileRoute, getRouteApi } from "@tanstack/react-router";

import { ShoppingListsPage } from "@/features/shopping/pages/shopping-lists-page.tsx";
import { listsQuery } from "@/features/shopping/shopping.queries.ts";
import { otherFirstNames } from "@/lib/shared-with.ts";

const householdRoute = getRouteApi("/_household");

export const Route = createFileRoute("/_household/lists/")({
  loader: ({ context }) => context.queryClient.ensureQueryData(listsQuery()),
  component: ListsRoute,
});

function ListsRoute() {
  const household = householdRoute.useLoaderData();
  const { user } = householdRoute.useRouteContext();
  return <ShoppingListsPage otherMembers={otherFirstNames(household.members, user.id)} />;
}
