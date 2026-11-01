import { Outlet, createFileRoute, redirect, useMatchRoute } from "@tanstack/react-router";

import { HouseholdShell } from "@/components/layout/household-shell.tsx";
import { AddChoreButton } from "@/features/chores/components/add-chore-button.tsx";
import { fetchCurrentHousehold } from "@/features/households/households.api.ts";
import { QuickAdd } from "@/features/shopping/components/quick-add.tsx";
import { AddTodoButton } from "@/features/todos/components/add-todo-button.tsx";

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
  // The + adds whatever the page is about: a chore on Chores, a to-do on Personal, a shopping
  // item everywhere else
  const matchRoute = useMatchRoute();
  const addButton = matchRoute({ to: "/chores", fuzzy: true }) ? (
    <AddChoreButton members={household.members} viewerId={user.id} />
  ) : matchRoute({ to: "/personal", fuzzy: true }) ? (
    <AddTodoButton />
  ) : (
    <QuickAdd viewer={user} />
  );
  return (
    <HouseholdShell addButton={addButton}>
      <Outlet />
    </HouseholdShell>
  );
}
