import { createFileRoute } from "@tanstack/react-router";

import { HouseholdOverviewPage } from "@/features/households/pages/household-overview-page.tsx";

export const Route = createFileRoute("/_household/dashboard")({
  component: HouseholdOverviewPage,
});
