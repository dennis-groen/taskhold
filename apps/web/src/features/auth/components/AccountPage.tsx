import type { ReactNode } from "react";

import { Group } from "@/components/layout/Group.tsx";
import { SettingsPage } from "@/components/layout/SettingsPage.tsx";
import { UserAvatar } from "@/components/UserAvatar.tsx";

import { DeleteAccountButton, type HouseholdSummary } from "./DeleteAccountButton.tsx";
import { SignOutButton } from "./SignOutButton.tsx";
import { SignOutElsewhereButton } from "./SignOutElsewhereButton.tsx";

/**
 * Who's signed in, signing out (here or everywhere else), and deleting the account. Deleting sits
 * on its own at the foot, away from the everyday rows.
 */
export function AccountPage({
  user,
  household,
  offline,
}: {
  user: { id: string; name: string; email: string; image: string | null };
  /** Null when the person isn't in a household */
  household: HouseholdSummary | null;
  /** In place of the actions while the app has no connection, since they all need the server */
  offline?: ReactNode;
}) {
  return (
    <SettingsPage title="Account">
      <div className="flex items-center gap-4 px-1 pt-2 pb-2">
        <UserAvatar
          name={user.name}
          image={user.image}
          size="lg"
          className="data-[size=lg]:size-13"
        />
        <div className="min-w-0 flex-1">
          <p className="truncate text-xl font-[780] tracking-[-0.015em] [font-stretch:112%]">
            {user.name}
          </p>
          <p className="text-[0.9375rem] [overflow-wrap:anywhere] text-muted-foreground">
            {user.email}
          </p>
          <p className="text-[0.8125rem] text-muted-foreground">Signed in with Google</p>
        </div>
      </div>

      {offline ?? (
        <>
          <Group className="mt-4">
            <SignOutButton />
            <SignOutElsewhereButton />
          </Group>

          {/* Apart from the everyday rows, so it's never hit on the way to Sign out */}
          <Group className="mt-10">
            <div className="border-y border-border py-1">
              <DeleteAccountButton household={household} currentUserId={user.id} />
            </div>
          </Group>
        </>
      )}
    </SettingsPage>
  );
}
