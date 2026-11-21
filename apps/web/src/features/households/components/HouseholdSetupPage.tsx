import { Link, getRouteApi, type LinkProps } from "@tanstack/react-router";
import type { ReactNode } from "react";

import { CaretRightIcon, HouseLineIcon, KeyIcon, type Icon } from "@/components/icons.ts";
import { PageHeading } from "@/components/layout/PageHeading.tsx";
import { cn } from "cn";

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

      <ul className="mt-8 flex flex-col gap-3">
        <li>
          <Choice
            to="/onboarding/join"
            icon={KeyIcon}
            title="Join a household"
            description="Use the code someone in your home shared."
            primary
          />
        </li>
        <li>
          <Choice
            to="/onboarding/create"
            icon={HouseLineIcon}
            title="Start a new one"
            description="Then invite the people you live with."
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
  primary = false,
}: {
  to: LinkProps["to"];
  icon: Icon;
  title: string;
  description: string;
  /** The usual way in, as a card in the household's yolk */
  primary?: boolean;
}) {
  return (
    <Link
      to={to}
      className={cn(
        "group flex items-center gap-4 rounded-[22px] p-[18px] outline-none transition-[scale,background-color] duration-150 ease-(--ease-out) focus-visible:ring-3 focus-visible:ring-ring/80 active:scale-[0.98] motion-reduce:active:scale-100",
        primary ? "bg-(--home-slab) text-(--home-on)" : "bg-card shadow-card hover:bg-muted/50",
      )}
    >
      <ChoiceIcon aria-hidden className="size-7 shrink-0" weight="bold" />
      <span className="min-w-0 flex-1">
        <span className="block text-xl leading-tight font-[820] tracking-[-0.02em] [font-stretch:125%]">
          {title}
        </span>
        <span
          className={cn(
            "mt-1 block text-sm text-pretty",
            primary ? "opacity-80" : "text-muted-foreground",
          )}
        >
          {description}
        </span>
      </span>
      <CaretRightIcon
        aria-hidden
        weight="bold"
        className="size-4 shrink-0 opacity-70 transition-transform duration-200 ease-(--ease-out) group-hover:translate-x-0.5"
      />
    </Link>
  );
}
