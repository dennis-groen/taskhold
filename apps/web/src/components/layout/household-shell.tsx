import { BroomIcon, HouseIcon, LockIcon, ShoppingCartIcon, type Icon } from "@phosphor-icons/react";
import { Link, type LinkProps } from "@tanstack/react-router";
import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

type NavItem = { to: LinkProps["to"]; label: string; icon: Icon };

const NAV: NavItem[] = [
  { to: "/lists", label: "Shopping", icon: ShoppingCartIcon },
  { to: "/chores", label: "Chores", icon: BroomIcon },
  { to: "/personal", label: "Personal", icon: LockIcon },
  { to: "/household", label: "Household", icon: HouseIcon },
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
    <div className="min-h-dvh bg-muted/50 dark:bg-background">
      <nav
        aria-label="Main"
        className="fixed inset-y-0 left-0 z-30 hidden w-24 flex-col items-center border-r border-sidebar-border bg-sidebar py-6 lg:flex"
      >
        <span className="text-sm font-semibold tracking-tight">taskhold</span>
        {/* Room for the add button, which is fixed so the bottom bar can share it */}
        <div className="h-24" aria-hidden />
        <ul className="flex w-full flex-col gap-1 px-2">
          {NAV.map((item) => (
            <li key={item.label}>
              <NavLink {...item} className="py-2" />
            </li>
          ))}
        </ul>
      </nav>

      <div className="lg:pl-24">
        <main className="mx-auto max-w-[640px] px-4 pt-6 pb-[calc(7rem+env(safe-area-inset-bottom))] lg:pt-10 lg:pb-16">
          {children}
        </main>
      </div>

      <nav
        aria-label="Main"
        data-bottom-nav
        className="fixed inset-x-0 bottom-0 z-30 border-t bg-background pb-[env(safe-area-inset-bottom)] lg:hidden"
      >
        <div className="mx-auto flex h-16 max-w-[640px] items-center px-2">
          <NavHalf items={NAV_LEFT} />
          {/* The add button floats over this gap */}
          <div className="w-20 shrink-0" aria-hidden />
          <NavHalf items={NAV_RIGHT} />
        </div>
      </nav>

      <div className="fixed bottom-[calc(1.75rem+env(safe-area-inset-bottom))] left-1/2 z-40 -translate-x-1/2 lg:top-16 lg:bottom-auto lg:left-5 lg:translate-x-0">
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

function NavLink({
  to,
  label,
  icon: IconComponent,
  className,
}: {
  to: LinkProps["to"];
  label: string;
  icon: Icon;
  className?: string;
}) {
  return (
    <Link
      to={to}
      className={cn(
        "flex min-h-12 flex-col items-center justify-center gap-0.5 rounded-lg text-muted-foreground outline-none hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50 data-[status=active]:text-primary",
        className,
      )}
    >
      {({ isActive }) => (
        <>
          <IconComponent className="size-6" weight={isActive ? "fill" : "regular"} />
          <span className="text-[11px] leading-4 font-medium">{label}</span>
        </>
      )}
    </Link>
  );
}
