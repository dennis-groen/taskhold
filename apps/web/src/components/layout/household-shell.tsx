import { BroomIcon, HouseIcon, LockIcon, ShoppingCartIcon, type Icon } from "@phosphor-icons/react";
import { Link, useLocation, type LinkProps } from "@tanstack/react-router";
import type { ReactNode } from "react";

import { ConnectionStatus } from "@/components/connection-status.tsx";
import { Wordmark } from "@/components/wordmark.tsx";
import { cn } from "@/lib/utils";

type NavItem = {
  to: LinkProps["to"];
  label: string;
  icon: Icon;
  /** Other pages that belong to this tab, so it stays lit there */
  alsoOn?: string[];
};

const NAV: NavItem[] = [
  { to: "/lists", label: "Shopping", icon: ShoppingCartIcon },
  { to: "/chores", label: "Chores", icon: BroomIcon },
  { to: "/personal", label: "Personal", icon: LockIcon },
  { to: "/household", label: "Household", icon: HouseIcon, alsoOn: ["/invite"] },
];

// On phones the add button sits in the middle of the bar, with half the tabs on either side.
const NAV_LEFT = NAV.slice(0, Math.ceil(NAV.length / 2));
const NAV_RIGHT = NAV.slice(Math.ceil(NAV.length / 2));

/**
 * Frame for people in a household: a rail on the left on wide screens, a bar at the bottom on
 * phones, and one round add button that sits in whichever is showing.
 */
export function HouseholdShell({
  addButton,
  children,
}: {
  /** The round add button, rendered once and placed by the shell */
  addButton: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="min-h-dvh bg-canvas">
      <ConnectionStatus />
      <nav
        aria-label="Main"
        className="fixed inset-y-0 left-0 z-30 hidden w-24 flex-col items-center border-r border-sidebar-border bg-sidebar py-6 lg:flex"
      >
        <Wordmark compact />
        {/* Room for the add button, which is fixed so the bottom bar can share it */}
        <div className="h-24" aria-hidden />
        <ul className="flex w-full flex-col gap-2 px-2">
          {NAV.map((item) => (
            <li key={item.label}>
              <NavLink {...item} />
            </li>
          ))}
        </ul>
      </nav>

      <div className="lg:pl-24">
        <main className="mx-auto max-w-[640px] px-4 pt-[calc(1.75rem+env(safe-area-inset-top))] pb-[calc(7.5rem+env(safe-area-inset-bottom))] sm:px-6 lg:pt-12 lg:pb-16">
          {children}
        </main>
      </div>

      <nav
        aria-label="Main"
        data-bottom-nav
        className="fixed inset-x-0 bottom-0 z-30 border-t border-border/70 bg-card/88 pb-[env(safe-area-inset-bottom)] backdrop-blur-xl backdrop-saturate-150 lg:hidden"
      >
        <div className="mx-auto flex h-17 max-w-[640px] items-center px-1">
          <NavHalf items={NAV_LEFT} />
          {/* The add button floats over this gap */}
          <div className="w-20 shrink-0" aria-hidden />
          <NavHalf items={NAV_RIGHT} />
        </div>
      </nav>

      <div className="fixed bottom-[calc(2.25rem+env(safe-area-inset-bottom))] left-1/2 z-40 -translate-x-1/2 lg:top-[6.25rem] lg:bottom-auto lg:left-5 lg:translate-x-0">
        {addButton}
      </div>
    </div>
  );
}

function NavHalf({ items }: { items: NavItem[] }) {
  return (
    <ul className="flex flex-1">
      {items.map((item) => (
        <li key={item.label} className="flex-1">
          <NavLink {...item} />
        </li>
      ))}
    </ul>
  );
}

/** A tab: the icon sits in a soft pill when it's the page you're on */
function NavLink({ to, label, icon: IconComponent, alsoOn = [] }: NavItem) {
  const pathname = useLocation({ select: (location) => location.pathname });
  const onRelatedPage = alsoOn.some((path) => pathname === path || pathname.startsWith(`${path}/`));

  return (
    <Link
      to={to}
      aria-current={onRelatedPage ? "page" : undefined}
      className="group/nav flex min-h-14 flex-col items-center justify-center gap-1 rounded-xl text-muted-foreground outline-none transition-colors duration-150 hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/80 data-[status=active]:text-primary-soft-foreground aria-[current=page]:text-primary-soft-foreground"
    >
      {({ isActive }) => {
        const lit = isActive || onRelatedPage;
        return (
          <>
            <span
              className={cn(
                "flex h-8 w-14 items-center justify-center rounded-full transition-[background-color,transform] duration-200 ease-out group-active/nav:scale-95 motion-reduce:group-active/nav:scale-100",
                lit ? "bg-primary-soft" : "group-hover/nav:bg-muted",
              )}
            >
              <IconComponent className="size-[1.375rem]" weight={lit ? "fill" : "regular"} />
            </span>
            <span
              className={cn("text-[0.6875rem] leading-none", lit ? "font-bold" : "font-medium")}
            >
              {label}
            </span>
          </>
        );
      }}
    </Link>
  );
}
