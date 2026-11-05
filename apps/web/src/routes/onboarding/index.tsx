import { createFileRoute } from "@tanstack/react-router";

import { DeleteAccountButton } from "@/features/auth/DeleteAccountButton.tsx";
import { HouseholdSetupPage } from "@/features/households/components/HouseholdSetupPage.tsx";

export const Route = createFileRoute("/onboarding/")({
  component: OnboardingIndex,
});

function OnboardingIndex() {
  const { user } = Route.useRouteContext();
  return (
    <HouseholdSetupPage
      accountAction={<DeleteAccountButton household={null} currentUserId={user.id} />}
    />
  );
}
