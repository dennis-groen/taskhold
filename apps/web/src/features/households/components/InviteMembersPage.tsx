import { Link, getRouteApi } from "@tanstack/react-router";

import { BackLink } from "@/components/BackLink.tsx";
import { ArrowRightIcon } from "@/components/icons.ts";
import { Group, GroupHeading } from "@/components/layout/Group.tsx";
import { PageHeading } from "@/components/layout/PageHeading.tsx";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "cn";

import { HouseholdMembers } from "./HouseholdMembers.tsx";
import { InviteCodeCard } from "./InviteCodeCard.tsx";
import { NeedsConnection } from "./NeedsConnection.tsx";
import { isSavedHousehold, type Household } from "../households.api.ts";

const householdRoute = getRouteApi("/_household");
const routeApi = getRouteApi("/_household/invite");

export function InviteMembersPage() {
  const household = householdRoute.useLoaderData();
  // The invite code is never kept on the device
  if (isSavedHousehold(household)) {
    return <NeedsConnection title="Invite people" householdName={household.name} />;
  }
  return <Invite household={household} />;
}

function Invite({ household }: { household: Household }) {
  const { user } = householdRoute.useRouteContext();
  const { created } = routeApi.useSearch();
  return (
    <>
      {!created && <BackLink to="/household" label="Household" />}
      <PageHeading
        title={created ? `${household.name} is ready` : `Invite people to ${household.name}`}
      >
        Share this code with the people you live with. They enter it after signing in to taskhold.
      </PageHeading>

      <div className="mt-8">
        <InviteCodeCard household={household} viewerId={user.id} reveal={created} />
      </div>

      {/* Right after creating: the obvious next step, before the members list */}
      {created && (
        <Link
          to="/lists"
          className={cn(buttonVariants({ variant: "soft", size: "xl" }), "mt-8 w-full sm:w-auto")}
        >
          Start your first list
          <ArrowRightIcon />
        </Link>
      )}

      <section className="mt-6">
        <GroupHeading>Already in {household.name}</GroupHeading>
        <Group>
          <HouseholdMembers members={household.members} currentUserId={user.id} />
        </Group>
      </section>
    </>
  );
}
