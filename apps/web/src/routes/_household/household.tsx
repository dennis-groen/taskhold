import { createFileRoute } from "@tanstack/react-router";

import { SignOutButton } from "@/features/auth/components/sign-out-button.tsx";
import { HouseholdOverviewPage } from "@/features/households/pages/household-overview-page.tsx";

export const Route = createFileRoute("/_household/household")({
  component: () => <HouseholdOverviewPage accountAction={<SignOutButton />} />,
});
