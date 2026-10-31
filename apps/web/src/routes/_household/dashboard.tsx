import { createFileRoute } from "@tanstack/react-router";

import { HouseholdOverviewPage } from "@/features/households/pages/household-overview-page.tsx";
import { ShoppingListsSection } from "@/features/shopping/components/shopping-lists-section.tsx";
import { listsQuery } from "@/features/shopping/shopping.queries.ts";

export const Route = createFileRoute("/_household/dashboard")({
  loader: ({ context }) => context.queryClient.ensureQueryData(listsQuery()),
  component: DashboardPage,
});

function DashboardPage() {
  return (
    <HouseholdOverviewPage>
      <ShoppingListsSection />
    </HouseholdOverviewPage>
  );
}
