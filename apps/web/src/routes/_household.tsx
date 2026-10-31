import { Outlet, createFileRoute, redirect } from "@tanstack/react-router";

import { HouseholdShell } from "@/components/layout/household-shell.tsx";
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
  return (
    <HouseholdShell addButton={<QuickAdd viewer={user} />}>
      <Outlet />
    </HouseholdShell>
  );
}
