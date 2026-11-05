import { createFileRoute } from "@tanstack/react-router";

import { DeleteAccountButton } from "@/features/auth/DeleteAccountButton.tsx";
import { SignOutButton } from "@/features/auth/SignOutButton.tsx";
import { HouseholdOverviewPage } from "@/features/households/components/HouseholdOverviewPage.tsx";
import { ChoreReminders } from "@/features/reminders/ChoreReminders.tsx";

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
