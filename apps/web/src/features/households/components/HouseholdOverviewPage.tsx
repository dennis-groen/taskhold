import { getRouteApi } from "@tanstack/react-router";
import type { ReactNode } from "react";

import { AreaHeader, Count } from "@/components/layout/AreaHeader.tsx";
import { Group, GroupHeading } from "@/components/layout/Group.tsx";
import { ThemeToggle } from "@/components/ThemeToggle.tsx";
import { LeftHandedRow } from "@/components/LeftHandedRow.tsx";
import { UserAvatar } from "@/components/UserAvatar.tsx";

import { HouseholdMembers } from "./HouseholdMembers.tsx";
import { InviteCodeCard } from "./InviteCodeCard.tsx";
import { LeaveHouseholdButton } from "./LeaveHouseholdButton.tsx";
import { NeedsConnection } from "./NeedsConnection.tsx";
import { RemoveMemberButton } from "./RemoveMemberButton.tsx";
import { isSavedHousehold, type Household } from "../households.api.ts";

const householdRoute = getRouteApi("/_household");

/**
 * `accountAction` is the sign-out button and `deleteAccount` the delete-account button, which
 * belong to the auth feature; `reminders` is the reminders feature's settings
 */
export function HouseholdOverviewPage(props: {
  accountAction?: ReactNode;
  deleteAccount?: (household: Household, currentUserId: string) => ReactNode;
  reminders?: ReactNode;
}) {
  const household = householdRoute.useLoaderData();
  if (isSavedHousehold(household)) {
    return <NeedsConnection title="Household" householdName={household.name} />;
  }
  return <Overview household={household} {...props} />;
}

function Overview({
  household,
  accountAction,
  deleteAccount,
  reminders,
}: {
  household: Household;
  accountAction?: ReactNode;
  deleteAccount?: (household: Household, currentUserId: string) => ReactNode;
  reminders?: ReactNode;
}) {
  const { user } = householdRoute.useRouteContext();
  const isOwner = household.members.some(
    (member) => member.id === user.id && member.role === "owner",
  );

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

      <GroupHeading>Members</GroupHeading>
      <Group>
        <HouseholdMembers
          members={household.members}
          currentUserId={user.id}
          renderAction={(member) =>
            isOwner && member.id !== user.id ? (
              <RemoveMemberButton member={member} householdName={household.name} />
            ) : null
          }
        />
      </Group>

      <GroupHeading>Invite someone</GroupHeading>
      <InviteCodeCard household={household} viewerId={user.id} />

      <GroupHeading>On this phone</GroupHeading>
      <Group>
        {reminders}
        <LeftHandedRow />
      </Group>

      <GroupHeading>Account</GroupHeading>
      <Group>
        <div className="flex min-h-15 items-center gap-3 py-2.5 pr-1 pl-4">
          <UserAvatar name={user.name} image={user.image} size="lg" />
          <span className="min-w-0 flex-1">
            <span className="block truncate text-base font-semibold">{user.name}</span>
            <span className="block truncate text-sm text-muted-foreground">{user.email}</span>
          </span>
          {accountAction}
        </div>
      </Group>

      <GroupHeading>Appearance</GroupHeading>
      <Group className="py-1.5 pr-4 pl-5 sm:pr-5 sm:pl-6 lg:px-0">
        <ThemeToggle />
      </Group>

      <div className="mt-10 flex flex-wrap gap-2 border-t border-border pt-5">
        <LeaveHouseholdButton household={household} currentUserId={user.id} />
        {deleteAccount?.(household, user.id)}
      </div>
    </>
  );
}
