import { createFileRoute, getRouteApi } from "@tanstack/react-router";

import { OfflineNote } from "@/components/layout/OfflineNote.tsx";
import { AccountPage } from "@/features/auth/components/AccountPage.tsx";
import { EndDemoButton } from "@/features/demo/components/EndDemoButton.tsx";
import { isSavedHousehold } from "@/features/households/households.api.ts";

const householdRoute = getRouteApi("/_household");

export const Route = createFileRoute("/_household/household/account")({
  component: AccountRoute,
});

function AccountRoute() {
  const { user, demoEndsAt } = householdRoute.useRouteContext();
  const household = householdRoute.useLoaderData();
  const offline = isSavedHousehold(household);
  return (
    <AccountPage
      user={user}
      household={offline ? null : household}
      demo={demoEndsAt ? <EndDemoButton /> : undefined}
      offline={
        offline ? (
          <OfflineNote className="mt-4">
            You're offline. Signing out and deleting your account wait until you're connected.
          </OfflineNote>
        ) : undefined
      }
    />
  );
}
