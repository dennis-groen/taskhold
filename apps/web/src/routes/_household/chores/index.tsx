import { createFileRoute, getRouteApi } from "@tanstack/react-router";

import { choresQuery } from "@/features/chores/chores.queries.ts";
import { ChoresPage } from "@/features/chores/components/ChoresPage.tsx";

const householdRoute = getRouteApi("/_household");

export const Route = createFileRoute("/_household/chores/")({
  loader: ({ context }) => context.queryClient.ensureQueryData(choresQuery()),
  component: ChoresRoute,
});

function ChoresRoute() {
  const household = householdRoute.useLoaderData();
  const { user } = householdRoute.useRouteContext();
  return <ChoresPage viewer={user} members={household.members} />;
}
