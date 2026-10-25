import { createFileRoute } from "@tanstack/react-router";

import { HouseholdSetupPage } from "@/features/households/pages/household-setup-page.tsx";

export const Route = createFileRoute("/onboarding/")({
  component: HouseholdSetupPage,
});
