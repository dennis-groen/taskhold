import { getRouteApi } from "@tanstack/react-router";
import type { ReactNode } from "react";

import { UserPlusIcon } from "@/components/icons.ts";
import { AreaHeader, Count } from "@/components/layout/AreaHeader.tsx";
import { Group, GroupHeading } from "@/components/layout/Group.tsx";
import { OfflineNote } from "@/components/layout/OfflineNote.tsx";
import { SettingLink } from "@/components/layout/SettingRow.tsx";

import { HouseholdMembers } from "./HouseholdMembers.tsx";
import { LeaveHouseholdButton } from "./LeaveHouseholdButton.tsx";
import { RemoveMemberButton } from "./RemoveMemberButton.tsx";
import { isSavedHousehold, type Household, type SavedHousehold } from "../households.api.ts";

const householdRoute = getRouteApi("/_household");

/**
 * The Household tab: who's in it and a way to invite more, then one row per kind of setting (the
 * account last), each opening a page of its own, and Leave at the foot. A new setting is a new row
 * here, not a new block, so the page stays one calm screen.
 *
 * `settings` are those rows; the route passes them in, since other features own them. In the demo,
 * `endDemo` takes the place of Invite and Leave: its household can't be shared or left.
 */
export function HouseholdOverviewPage({
  settings,
  endDemo,
}: {
  settings?: ReactNode;
  endDemo?: ReactNode;
}) {
  const household = householdRoute.useLoaderData();
  const { user } = householdRoute.useRouteContext();

  return (
    <>
      <AreaHeader
        title={household.name}
        meta={
          <Count value={household.members.length}>
            {household.members.length === 1 ? "person" : "people"}
          </Count>
        }
      />

      <GroupHeading>People</GroupHeading>
      {isSavedHousehold(household) ? (
        <Offline household={household} />
      ) : (
        <People household={household} currentUserId={user.id} canInvite={!endDemo} />
      )}

      {settings && (
        <>
          <GroupHeading>Settings</GroupHeading>
          <Group>{settings}</Group>
        </>
      )}

      {!isSavedHousehold(household) && (
        // Set apart from the rows above, so it's never tapped on the way to something else
        <Group className="mt-10">
          <div className="border-y border-border py-1">
            {endDemo ?? <LeaveHouseholdButton household={household} currentUserId={user.id} />}
          </div>
        </Group>
      )}
    </>
  );
}

function People({
  household,
  currentUserId,
  canInvite,
}: {
  household: Household;
  currentUserId: string;
  canInvite: boolean;
}) {
  const isOwner = household.members.some(
    (member) => member.id === currentUserId && member.role === "owner",
  );
  return (
    <Group>
      <HouseholdMembers
        members={household.members}
        currentUserId={currentUserId}
        renderAction={(member) =>
          isOwner && member.id !== currentUserId ? (
            <RemoveMemberButton member={member} householdName={household.name} />
          ) : null
        }
      />
      {canInvite && (
        <SettingLink
          to="/invite"
          icon={UserPlusIcon}
          tone="accent"
          title="Invite someone"
          sub={
            household.members.length === 1
              ? "It's just you so far. Share a code to get started."
              : "Share a code with people you live with"
          }
        />
      )}
    </Group>
  );
}

/** Roles and the invite code live on the server; settings and the account still work */
function Offline({ household }: { household: SavedHousehold }) {
  return (
    <OfflineNote className="mt-2">
      You're offline, so {household.name}'s people and invite code show once you're connected.
    </OfflineNote>
  );
}
