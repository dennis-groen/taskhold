import { CaretRightIcon, UserPlusIcon } from "@phosphor-icons/react";
import { Link, getRouteApi } from "@tanstack/react-router";
import type { ReactNode } from "react";

import { Group, GroupHeading } from "@/components/layout/group.tsx";
import { PageHeading } from "@/components/layout/page-heading.tsx";
import { UserAvatar } from "@/components/user-avatar.tsx";

import { HouseholdMembers } from "../components/household-members.tsx";
import { LeaveHouseholdButton } from "../components/leave-household-button.tsx";
import { RemoveMemberButton } from "../components/remove-member-button.tsx";

const householdRoute = getRouteApi("/_household");

/** `accountAction` is the sign-out button, which belongs to the auth feature */
export function HouseholdOverviewPage({ accountAction }: { accountAction?: ReactNode }) {
  const household = householdRoute.useLoaderData();
  const { user } = householdRoute.useRouteContext();
  const isOwner = household.members.some(
    (member) => member.id === user.id && member.role === "owner",
  );

  return (
    <>
      <PageHeading title="Household">{household.name}</PageHeading>

      <GroupHeading className="mt-2">Members</GroupHeading>
      <Group>
        <Link
          to="/invite"
          className="flex min-h-13 items-center gap-3 px-4 py-3 text-primary outline-none hover:bg-muted/50 focus-visible:bg-muted/50"
        >
          <UserPlusIcon className="size-5 shrink-0" weight="bold" />
          <span className="flex-1 text-base">Invite people</span>
          <CaretRightIcon className="size-4 text-muted-foreground" />
        </Link>
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

      <GroupHeading>Account</GroupHeading>
      <Group>
        <div className="flex min-h-14 items-center gap-3 px-4 py-2.5">
          <UserAvatar name={user.name} image={user.image} />
          <span className="min-w-0 flex-1">
            <span className="block truncate text-base">{user.name}</span>
            <span className="block truncate text-sm text-muted-foreground">{user.email}</span>
          </span>
          {accountAction}
        </div>
      </Group>

      <div className="mt-8">
        <LeaveHouseholdButton household={household} currentUserId={user.id} />
      </div>
    </>
  );
}
