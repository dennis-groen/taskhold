import { createFileRoute } from "@tanstack/react-router";

import { DeleteAccountButton } from "@/features/auth/components/delete-account-button.tsx";
import { SignOutButton } from "@/features/auth/components/sign-out-button.tsx";
import { HouseholdOverviewPage } from "@/features/households/pages/household-overview-page.tsx";
import { ChoreReminders } from "@/features/reminders/components/chore-reminders.tsx";

export const Route = createFileRoute("/_household/household")({
  component: () => (
    <HouseholdOverviewPage
      accountAction={<SignOutButton />}
      reminders={<ChoreReminders />}
      deleteAccount={(household, currentUserId) => (
        <DeleteAccountButton household={household} currentUserId={currentUserId} />
      )}
    />
  ),
});
