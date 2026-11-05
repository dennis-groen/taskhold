import { createFileRoute } from "@tanstack/react-router";

import { CreateHouseholdPage } from "@/features/households/components/CreateHouseholdPage.tsx";

export const Route = createFileRoute("/onboarding/create")({
  component: CreateHouseholdPage,
});
