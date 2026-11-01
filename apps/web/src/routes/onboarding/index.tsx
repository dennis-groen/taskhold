import { createFileRoute } from "@tanstack/react-router";

import { DeleteAccountButton } from "@/features/auth/components/delete-account-button.tsx";
import { HouseholdSetupPage } from "@/features/households/pages/household-setup-page.tsx";

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
