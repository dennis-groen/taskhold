import { CaretRightIcon, UserPlusIcon } from "@phosphor-icons/react";
import { Link, getRouteApi } from "@tanstack/react-router";
import type { ReactNode } from "react";

import { Group, GroupHeading } from "@/components/layout/group.tsx";
import { PageHeading } from "@/components/layout/page-heading.tsx";
import { ThemeToggle } from "@/components/theme-toggle.tsx";
import { UserAvatar } from "@/components/user-avatar.tsx";

import { HouseholdMembers } from "../components/household-members.tsx";
import { LeaveHouseholdButton } from "../components/leave-household-button.tsx";
import { NeedsConnection } from "../components/needs-connection.tsx";
import { RemoveMemberButton } from "../components/remove-member-button.tsx";
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
      <PageHeading title="Household">{household.name}</PageHeading>

      <GroupHeading className="mt-2">Members</GroupHeading>
      <Group>
        <Link
          to="/invite"
          className="group/invite flex min-h-15 items-center gap-3 px-4 py-3 text-primary-soft-foreground outline-none transition-colors hover:bg-primary-soft/35 focus-visible:bg-primary-soft/35 focus-visible:ring-2 focus-visible:ring-ring/80 focus-visible:ring-inset active:bg-primary-soft/50"
        >
          <span
            aria-hidden
            className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary-soft"
          >
            <UserPlusIcon className="size-4.5" weight="bold" />
          </span>
          <span className="flex-1 text-base font-semibold">Invite people</span>
          <CaretRightIcon
            weight="bold"
            className="size-4 text-muted-foreground/70 transition-transform duration-200 ease-out group-hover/invite:translate-x-0.5"
          />
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
        <div className="flex min-h-15 items-center gap-3 px-4 py-2.5">
          <UserAvatar name={user.name} image={user.image} />
          <span className="min-w-0 flex-1">
            <span className="block truncate text-base font-semibold">{user.name}</span>
            <span className="block truncate text-sm text-muted-foreground">{user.email}</span>
          </span>
          {accountAction}
        </div>
      </Group>

      {reminders}

      <GroupHeading>Appearance</GroupHeading>
      <Group className="p-1.5">
        <ThemeToggle />
      </Group>

      <div className="mt-10 flex flex-wrap gap-2 border-t border-border/70 pt-5">
        <LeaveHouseholdButton household={household} currentUserId={user.id} />
        {deleteAccount?.(household, user.id)}
      </div>
    </>
  );
}
