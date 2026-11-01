import { CaretRightIcon, HouseLineIcon, KeyIcon, type Icon } from "@phosphor-icons/react";
import { Link, getRouteApi, type LinkProps } from "@tanstack/react-router";
import type { ReactNode } from "react";

import { PageHeading } from "@/components/layout/page-heading.tsx";

const routeApi = getRouteApi("/onboarding/");

/** `accountAction` is the delete-account button, which belongs to the auth feature */
export function HouseholdSetupPage({ accountAction }: { accountAction?: ReactNode }) {
  const { user } = routeApi.useRouteContext();
  const firstName = user.name.trim().split(/\s+/)[0];

  return (
    <>
      <PageHeading title="Set up your household">
        Hi {firstName}. Everyone in a household shares one shopping list and one set of chores. Your
        personal to-dos stay private.
      </PageHeading>

      <ul className="mt-8 divide-y overflow-hidden rounded-xl border">
        <li>
          <Choice
            to="/onboarding/create"
            icon={HouseLineIcon}
            title="Create a household"
            description="Start fresh and invite the people you live with."
          />
        </li>
        <li>
          <Choice
            to="/onboarding/join"
            icon={KeyIcon}
            title="Join a household"
            description="Use the code someone in your home shared."
          />
        </li>
      </ul>

      {accountAction && <div className="mt-12 -ml-4">{accountAction}</div>}
    </>
  );
}

function Choice({
  to,
  icon: ChoiceIcon,
  title,
  description,
}: {
  to: LinkProps["to"];
  icon: Icon;
  title: string;
  description: string;
}) {
  return (
    <Link
      to={to}
      className="group flex items-start gap-4 p-4 transition-colors outline-none hover:bg-muted/60 focus-visible:bg-muted/60 focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:ring-inset sm:p-5"
    >
      <ChoiceIcon className="mt-0.5 size-5 shrink-0 text-muted-foreground transition-colors group-hover:text-primary" />
      <span className="min-w-0 flex-1">
        <span className="block font-medium">{title}</span>
        <span className="mt-0.5 block text-sm text-pretty text-muted-foreground">
          {description}
        </span>
      </span>
      <CaretRightIcon className="mt-1 size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
    </Link>
  );
}
