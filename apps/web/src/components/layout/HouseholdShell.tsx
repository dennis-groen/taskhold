import { Link, useLocation, type LinkProps } from "@tanstack/react-router";
import { useEffect, type ReactNode } from "react";

import { ConnectionStatus } from "@/components/ConnectionStatus.tsx";
import {
  BasketIcon,
  BroomIcon,
  HouseIcon,
  ListChecksIcon,
  LockIcon,
  type Icon,
} from "@/components/icons.ts";
import { UserAvatar } from "@/components/UserAvatar.tsx";
import { Wordmark } from "@/components/Wordmark.tsx";
import { applyShellArea, type ShellArea } from "@/lib/theme.ts";
import { cn } from "cn";

type NavItem = {
  to: LinkProps["to"];
  label: string;
  icon: Icon;
  /** The shell section this tab opens, whose colour its pill takes when it's the page you're on */
  area: ShellArea;
  /** Private: a small lock beside the label, as only you see what's there */
  private?: boolean;
  /** Other pages that belong to this tab, so it stays lit there */
  alsoOn?: string[];
};

/** The section's own colour, for the dot beside its name in the sidebar */
const AREA_DOT: Record<ShellArea, string> = {
  shop: "bg-(--shop-slab)",
  chores: "bg-(--cho-slab)",
  todos: "bg-(--todo-slab) dark:bg-foreground",
  home: "bg-(--home-slab)",
};

/** What the sidebar says beside each section, and the shopping lists under Shopping */
export type RailInfo = {
  counts: Partial<Record<ShellArea, { text: string; alert?: boolean }>>;
  lists: { id: string; name: string; count: number }[];
  viewer: { name: string; image: string | null };
  householdName: string;
};

const NAV: NavItem[] = [
  { to: "/lists", label: "Shopping", icon: BasketIcon, area: "shop" },
  { to: "/chores", label: "Chores", icon: BroomIcon, area: "chores" },
  { to: "/personal", label: "To-dos", icon: ListChecksIcon, area: "todos", private: true },
  { to: "/household", label: "Household", icon: HouseIcon, area: "home", alsoOn: ["/invite"] },
];

/**
 * Frame for people in a household. On phones, one dock under the thumb: the add field for the
 * section you're in, over four tabs. On wide screens a sidebar holds both. The section colours the
 * whole app while you're in it (styles/globals.css, data-area), status bar included.
 */
export function HouseholdShell({
  area,
  addButton,
  badges = {},
  rail,
  children,
}: {
  area: ShellArea;
  /** A red count on a tab, like overdue chores. Zero shows nothing. */
  badges?: Partial<Record<ShellArea, number>>;
  /** Counts, lists and who's signed in, for the sidebar on wide screens */
  rail?: RailInfo;
  /** The add field for this section, rendered once and placed by the shell. Household has none. */
  addButton: ReactNode;
  children: ReactNode;
}) {
  // The theme provider re-reads the status bar colour itself when the theme changes
  useEffect(() => {
    applyShellArea(area);
  }, [area]);
  // Leaving the household (sign-out, onboarding) goes back to the plain canvas
  useEffect(() => () => applyShellArea(null), []);

  return (
    <div className="min-h-dvh bg-canvas">
      <ConnectionStatus />
      <nav
        aria-label="Main"
        className="fixed inset-y-0 left-0 z-30 hidden w-64 flex-col border-r border-sidebar-border bg-sidebar px-3 pt-7 pb-5 lg:flex"
      >
        <Wordmark className="px-3" />
        <ul className="mt-6 flex flex-col gap-0.5 overflow-y-auto">
          {NAV.map((item) => (
            <li key={item.label}>
              <RailLink {...item} count={rail?.counts[item.area]} />
              {item.area === "shop" && rail && rail.lists.length > 0 && (
                <ul className="mb-1 flex flex-col gap-0.5">
                  {rail.lists.map((list) => (
                    <li key={list.id}>
                      <Link
                        to="/lists/$listId"
                        params={{ listId: list.id }}
                        className="flex min-h-10 items-center gap-3 rounded-xl pr-3 pl-9 text-[0.9375rem] font-[550] text-muted-foreground outline-none hover:bg-muted/70 focus-visible:ring-3 focus-visible:ring-ring/80 data-[status=active]:bg-area-tint data-[status=active]:font-[700] data-[status=active]:text-foreground"
                      >
                        <span className="min-w-0 flex-1 truncate">{list.name}</span>
                        <span className="text-[0.8125rem] tabular-nums">{list.count}</span>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </li>
          ))}
        </ul>
        {rail && (
          <div className="mt-auto flex items-center gap-3 px-3 pt-4">
            <UserAvatar name={rail.viewer.name} image={rail.viewer.image} size="sm" />
            <span className="min-w-0 text-sm leading-tight">
              <b className="block truncate font-[700]">{rail.viewer.name}</b>
              <span className="block truncate text-muted-foreground">{rail.householdName}</span>
            </span>
          </div>
        )}
      </nav>

      <div className="lg:pl-64">
        <main className="mx-auto max-w-[680px] px-4 pb-[calc(12.5rem+env(safe-area-inset-bottom))] sm:px-6 lg:px-8 lg:pt-8 lg:pb-40">
          {children}
        </main>
      </div>

      {/* On wide screens the add field sits at the foot of the page column, over a fade */}
      {addButton && (
        <div className="pointer-events-none fixed right-0 bottom-0 left-64 z-20 hidden bg-linear-to-t from-canvas from-50% to-canvas/0 pt-10 pb-5 lg:block">
          <div className="pointer-events-auto mx-auto max-w-[680px] px-8">
            <div className="rounded-[1.75rem] bg-dock p-1.5 shadow-[0_0_0_1px_var(--dock-line),var(--dock-shadow)] backdrop-blur-[22px]">
              {addButton}
            </div>
          </div>
        </div>
      )}

      {/* Rows fade out above the dock instead of being cut off behind it */}
      <div
        aria-hidden
        className="pointer-events-none fixed inset-x-0 bottom-0 z-20 h-[calc(9.5rem+env(safe-area-inset-bottom))] bg-linear-to-t from-canvas from-55% to-canvas/0 lg:hidden"
      />
      <div
        data-bottom-nav
        className="fixed inset-x-2 bottom-[max(0.75rem,calc(env(safe-area-inset-bottom)-0.75rem))] z-30 mx-auto max-w-[560px] rounded-[1.75rem] bg-dock p-1.5 shadow-[0_0_0_1px_var(--dock-line),var(--dock-shadow)] backdrop-blur-[22px] backdrop-saturate-[1.6] lg:hidden"
      >
        {addButton}
        <nav aria-label="Main">
          <ul className={cn("grid h-14 grid-cols-4", addButton && "mt-0.5")}>
            {NAV.map((item) => (
              <li key={item.label} className="flex">
                <NavLink {...item} badge={badges[item.area] ?? 0} />
              </li>
            ))}
          </ul>
        </nav>
      </div>
    </div>
  );
}

/**
 * A tab: its icon sits in a pill of its area's colour when it's the page you're on. In the rail
 * the label sits beside the pill instead of under it.
 */
function NavLink({
  to,
  label,
  icon: IconComponent,
  private: isPrivate = false,
  alsoOn = [],
  badge,
}: NavItem & { badge: number }) {
  const pathname = useLocation({ select: (location) => location.pathname });
  const onRelatedPage = alsoOn.some((path) => pathname === path || pathname.startsWith(`${path}/`));

  return (
    <Link
      to={to}
      aria-current={onRelatedPage ? "page" : undefined}
      aria-label={[label, isPrivate && "only you", badge > 0 && `${badge} overdue`]
        .filter(Boolean)
        .join(", ")}
      className={cn(
        "group/nav flex flex-1 items-center text-muted-foreground outline-none focus-visible:ring-3 focus-visible:ring-ring/80 aria-[current=page]:text-foreground data-[status=active]:text-foreground",
        "min-h-11 flex-col justify-center gap-[3px] rounded-2xl text-xs",
      )}
    >
      {({ isActive }) => {
        const lit = isActive || onRelatedPage;
        return (
          <>
            <span
              className={cn(
                "relative flex h-[30px] w-[54px] items-center justify-center rounded-full transition-[background-color,color,scale] duration-200 ease-(--ease-out) group-active/nav:scale-[0.94] motion-reduce:group-active/nav:scale-100",
                lit && "bg-area-tab text-area-tab-on",
              )}
            >
              <IconComponent className="size-[23px]" weight={lit ? "fill" : "regular"} />
              {badge > 0 && (
                <b
                  aria-hidden
                  className="absolute -top-1 right-1.5 grid h-[18px] min-w-[18px] place-items-center rounded-full bg-destructive px-1 text-[0.6875rem] leading-none font-[800] text-white ring-2 ring-dock tabular-nums transition-[scale,opacity] duration-200 ease-(--ease-out) starting:scale-50 starting:opacity-0"
                >
                  {badge}
                </b>
              )}
            </span>
            <span
              className={cn(
                "flex items-center gap-[3px] leading-none",
                lit ? "font-[750]" : "font-[650]",
              )}
            >
              {label}
              {isPrivate && <LockIcon aria-hidden weight="bold" className="size-3" />}
            </span>
          </>
        );
      }}
    </Link>
  );
}

/**
 * A sidebar row: the area's colour as a dot, its name, and what's waiting there. The page you're
 * on is tinted in its colour.
 */
function RailLink({
  to,
  label,
  area,
  private: isPrivate = false,
  alsoOn = [],
  count,
}: NavItem & { count?: { text: string; alert?: boolean } }) {
  const pathname = useLocation({ select: (location) => location.pathname });
  const onRelatedPage = alsoOn.some((path) => pathname === path || pathname.startsWith(`${path}/`));

  return (
    <Link
      to={to}
      // Lit on the overview only; an open list lights its own row below
      activeOptions={{ exact: area === "shop" }}
      aria-current={onRelatedPage ? "page" : undefined}
      aria-label={[label, isPrivate && "only you", count?.text].filter(Boolean).join(", ")}
      className="flex min-h-11 items-center gap-3 rounded-xl px-3 text-[0.9375rem] font-[650] text-foreground outline-none hover:bg-muted/70 focus-visible:ring-3 focus-visible:ring-ring/80 aria-[current=page]:bg-area-tint aria-[current=page]:text-area-fg data-[status=active]:bg-area-tint data-[status=active]:text-area-fg"
    >
      <span aria-hidden className={cn("size-2.5 shrink-0 rounded-[3px]", AREA_DOT[area])} />
      <span className="flex min-w-0 flex-1 items-center gap-1">
        {label}
        {isPrivate && <LockIcon aria-hidden weight="bold" className="size-3" />}
      </span>
      {count && (
        <span
          aria-hidden
          className={cn(
            "text-[0.8125rem] font-[600] tabular-nums",
            count.alert ? "text-destructive" : "text-muted-foreground",
          )}
        >
          {count.text}
        </span>
      )}
    </Link>
  );
}
