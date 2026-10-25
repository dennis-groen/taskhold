import { Outlet, createFileRoute, redirect } from "@tanstack/react-router";

import { PageShell } from "@/components/page-shell.tsx";
import { api, parseResponse } from "@/lib/api.ts";

// Pages for people who belong to a household; loads that household once for all of them
export const Route = createFileRoute("/_household")({
  beforeLoad: ({ context }) => {
    const { user, household } = context.viewer;
    if (!user) throw redirect({ to: "/" });
    if (!household) throw redirect({ to: "/onboarding" });
    return { user };
  },
  loader: async () => (await parseResponse(api.household.$get())).household,
  component: HouseholdLayout,
});

function HouseholdLayout() {
  const { user } = Route.useRouteContext();
  return (
    <PageShell user={user}>
      <Outlet />
    </PageShell>
  );
}
