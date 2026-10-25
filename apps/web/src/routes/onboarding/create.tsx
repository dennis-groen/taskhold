import { createFileRoute } from "@tanstack/react-router";

import { CreateHouseholdPage } from "@/features/households/pages/create-household-page.tsx";

export const Route = createFileRoute("/onboarding/create")({
  component: CreateHouseholdPage,
});
