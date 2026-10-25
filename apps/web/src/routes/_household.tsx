import { Outlet, createFileRoute, redirect } from "@tanstack/react-router";

import { AppShell } from "@/components/layout/app-shell.tsx";
import { SignOutButton } from "@/features/auth/components/sign-out-button.tsx";
import { fetchCurrentHousehold } from "@/features/households/households.api.ts";

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
    <AppShell user={user} actions={<SignOutButton />}>
      <Outlet />
    </AppShell>
  );
}
