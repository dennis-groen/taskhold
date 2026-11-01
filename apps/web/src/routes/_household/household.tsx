import { createFileRoute } from "@tanstack/react-router";

import { DeleteAccountButton } from "@/features/auth/components/delete-account-button.tsx";
import { SignOutButton } from "@/features/auth/components/sign-out-button.tsx";
import { HouseholdOverviewPage } from "@/features/households/pages/household-overview-page.tsx";

export const Route = createFileRoute("/_household/household")({
  component: () => (
    <HouseholdOverviewPage
      accountAction={<SignOutButton />}
      deleteAccount={(household, currentUserId) => (
        <DeleteAccountButton household={household} currentUserId={currentUserId} />
      )}
    />
  ),
});
