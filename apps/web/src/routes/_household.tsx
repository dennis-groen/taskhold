import { Outlet, createFileRoute, redirect, useMatchRoute } from "@tanstack/react-router";

import { HouseholdShell } from "@/components/layout/household-shell.tsx";
import { AddChoreButton } from "@/features/chores/components/add-chore-button.tsx";
import { fetchCurrentHousehold } from "@/features/households/households.api.ts";
import { QuickAdd } from "@/features/shopping/components/quick-add.tsx";

// Pages for people who belong to a household; loads that household once for all of them
export const Route = createFileRoute("/_household")({
  beforeLoad: ({ context }) => {
    const { user, household } = context.viewer;
    if (!user) throw redirect({ to: "/" });
    if (!household) throw redirect({ to: "/onboarding" });
    return { user };
  },
  loader: () => fetchCurrentHousehold(),
  component: HouseholdLayout,
});

function HouseholdLayout() {
  const { user } = Route.useRouteContext();
  const household = Route.useLoaderData();
  // The + adds whatever the page is about: a chore on the chores page, a shopping item elsewhere
  const onChores = useMatchRoute()({ to: "/chores", fuzzy: true });
  const addButton = onChores ? (
    <AddChoreButton members={household.members} viewerId={user.id} />
  ) : (
    <QuickAdd viewer={user} />
  );
  return (
    <HouseholdShell addButton={addButton}>
      <Outlet />
    </HouseholdShell>
  );
}
