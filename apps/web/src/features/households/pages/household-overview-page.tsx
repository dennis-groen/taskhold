import { UserPlusIcon } from "@phosphor-icons/react";
import { Link, getRouteApi } from "@tanstack/react-router";

import { PageHeading } from "@/components/layout/page-heading.tsx";
import { buttonVariants } from "@/components/ui/button";

import { HouseholdMembers } from "../components/household-members.tsx";

const householdRoute = getRouteApi("/_household");

export function HouseholdOverviewPage() {
  const household = householdRoute.useLoaderData();
  const { user } = householdRoute.useRouteContext();
  const count = household.members.length;

  return (
    <>
      <PageHeading title={household.name}>
        {count === 1 ? "Just you so far." : `${count} people share this household.`} Shopping lists
        and chores will show up here.
      </PageHeading>

      <section className="mt-10">
        <div className="mb-3 flex items-center justify-between gap-4">
          <h2 className="text-sm font-medium">Members</h2>
          <Link to="/invite" className={buttonVariants({ variant: "outline", size: "sm" })}>
            <UserPlusIcon />
            Invite people
          </Link>
        </div>
        <HouseholdMembers members={household.members} currentUserId={user.id} />
      </section>
    </>
  );
}
