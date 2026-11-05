import { CaretRightIcon, HouseLineIcon, KeyIcon, type Icon } from "@phosphor-icons/react";
import { Link, getRouteApi, type LinkProps } from "@tanstack/react-router";
import type { ReactNode } from "react";

import { PageHeading } from "@/components/layout/PageHeading.tsx";

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

      <ul className="mt-8 divide-y divide-border/80 overflow-hidden rounded-xl bg-card shadow-card">
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
      className="group flex items-center gap-4 p-4 transition-colors outline-none hover:bg-muted/40 focus-visible:bg-muted/60 active:bg-muted/70 focus-visible:ring-3 focus-visible:ring-ring/80 focus-visible:ring-inset sm:p-5"
    >
      <span
        aria-hidden
        className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-primary-soft text-primary-soft-foreground"
      >
        <ChoiceIcon className="size-5.5" weight="duotone" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block font-semibold">{title}</span>
        <span className="mt-0.5 block text-sm text-pretty text-muted-foreground">
          {description}
        </span>
      </span>
      <CaretRightIcon
        weight="bold"
        className="size-4 shrink-0 text-muted-foreground/70 transition-transform duration-200 ease-out group-hover:translate-x-0.5"
      />
    </Link>
  );
}
