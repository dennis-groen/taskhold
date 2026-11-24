import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Outlet,
  createFileRoute,
  redirect,
  useMatchRoute,
  useRouter,
} from "@tanstack/react-router";
import { useCallback, useRef, useState } from "react";

import { JotButton } from "@/components/JotButton.tsx";
import { AddSheetTop, type AddKind } from "@/components/layout/AddSheet.tsx";
import { HouseholdShell, type RailInfo } from "@/components/layout/HouseholdShell.tsx";
import { SheetContent } from "@/components/layout/Sheet.tsx";
import { Drawer, DrawerDescription, DrawerTitle } from "@/components/ui/drawer";
import { NewChoreForm } from "@/features/chores/components/NewChoreForm.tsx";
import { useOverdueCount } from "@/features/chores/chores.hooks.ts";
import { ViewerUnavailableError } from "@/features/auth/auth.api.ts";
import {
  fetchCurrentHousehold,
  householdSummary,
  type Household,
  type SavedHousehold,
} from "@/features/households/households.api.ts";
import { ShopDock } from "@/features/shopping/components/ShopDock.tsx";
import { listsQuery } from "@/features/shopping/shopping.queries.ts";
import { NewTodoForm } from "@/features/todos/components/NewTodoForm.tsx";
import { todosQuery } from "@/features/todos/todos.queries.ts";
import { useLiveUpdates, type LiveMessage } from "@/lib/live-updates.ts";
import { keepForOffline, keptForOffline } from "@/lib/offline-cache.ts";
import type { ShellArea } from "@/lib/theme.ts";
import { refetchArea, refetchEverything } from "@/lib/offline-changes.ts";

// Pages for people who belong to a household; loads that household once for all of them
export const Route = createFileRoute("/_household")({
  beforeLoad: ({ context }) => {
    const { user, household } = context.viewer;
    if (!user) throw redirect({ to: "/" });
    if (!household) throw redirect({ to: "/onboarding" });
    return { user, householdId: household.id };
  },
  loader: async ({ context }): Promise<Household | SavedHousehold> => {
    const { queryClient, offline, householdId } = context;
    if (offline) {
      // Opened without a connection: the member names kept on the device are enough for lists,
      // chores and to-dos
      // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- kept below, from householdSummary
      const kept = keptForOffline(queryClient, "household") as
        | Omit<SavedHousehold, "offline">
        | undefined;
      if (kept?.id !== householdId) throw new ViewerUnavailableError();
      return { ...kept, offline: true };
    }
    const household = await fetchCurrentHousehold();
    keepForOffline(queryClient, "household", householdSummary(household));
    return household;
  },
  component: HouseholdLayout,
});

function HouseholdLayout() {
  useRefetchOnLiveChanges();
  const { user } = Route.useRouteContext();
  const household = Route.useLoaderData();
  const overdue = useOverdueCount();
  const rail = useRailInfo(household.name, user, overdue);
  // The area colours the app, and the dock's add field adds whatever the page is about: a chore on
  // Chores, a to-do on To-dos, a shopping item everywhere else
  const matchRoute = useMatchRoute();
  const area: ShellArea = matchRoute({ to: "/chores", fuzzy: true })
    ? "chores"
    : matchRoute({ to: "/personal", fuzzy: true })
      ? "todos"
      : matchRoute({ to: "/household", fuzzy: true }) || matchRoute({ to: "/invite", fuzzy: true })
        ? "home"
        : "shop";
  const [adding, setAdding] = useState<AddKind | null>(null);
  // Typed into the add sheet; kept when switching between Chore and To-do
  const [name, setName] = useState("");
  const nameRef = useRef<HTMLInputElement>(null);
  const startAdding = (kind: AddKind) => {
    setName("");
    setAdding(kind);
  };
  // The sheet keeps showing what it showed while it slides away
  const [shownKind, setShownKind] = useState<AddKind>("chore");
  if (adding !== null && adding !== shownKind) setShownKind(adding);

  const addButton =
    area === "chores" ? (
      <JotButton label="Add a chore" onClick={() => startAdding("chore")} />
    ) : area === "todos" ? (
      <JotButton label="Jot a to-do" onClick={() => startAdding("todo")} />
    ) : area === "shop" ? (
      <ShopDock viewer={user} />
    ) : null;
  return (
    <HouseholdShell
      area={area}
      addButton={addButton}
      // An open list is scrolled through in the aisle; there the tick matters more than the field
      foldAddOnScroll={Boolean(matchRoute({ to: "/lists/$listId" }))}
      badges={{ chores: overdue }}
      rail={rail}
    >
      <Outlet />
      <Drawer open={adding !== null} onOpenChange={(open) => !open && setAdding(null)}>
        <SheetContent initialFocus={nameRef}>
          <DrawerTitle className="sr-only">
            {shownKind === "chore" ? "New chore" : "New to-do"}
          </DrawerTitle>
          <DrawerDescription className="sr-only">
            {shownKind === "chore" ? "Everyone in the household sees it." : "Only you can see it."}
          </DrawerDescription>
          <AddSheetTop
            kind={shownKind}
            onKind={(kind) => {
              setAdding(kind);
              nameRef.current?.focus();
            }}
          />
          {/* Fresh choices each time it opens; the typed name carries across the switch */}
          {adding !== null &&
            (shownKind === "chore" ? (
              <NewChoreForm
                members={household.members}
                viewerId={user.id}
                name={name}
                onNameChange={setName}
                nameRef={nameRef}
                onAdded={() => setAdding(null)}
              />
            ) : (
              <NewTodoForm
                name={name}
                onNameChange={setName}
                nameRef={nameRef}
                onAdded={() => setAdding(null)}
              />
            ))}
        </SheetContent>
      </Drawer>
    </HouseholdShell>
  );
}

/**
 * What the sidebar shows on wide screens: what's left to buy (and per list), overdue chores, open
 * to-dos. Each fills in once its area has loaded.
 */
function useRailInfo(
  householdName: string,
  viewer: { name: string; image?: string | null },
  overdue: number,
): RailInfo {
  const { data: lists = [] } = useQuery(listsQuery());
  const { data: todos = [] } = useQuery(todosQuery());
  const toGet = lists.reduce((sum, list) => sum + list.openCount, 0);
  const openTodos = todos.filter((todo) => !todo.done).length;
  return {
    counts: {
      shop: { text: String(toGet) },
      ...(overdue > 0 && { chores: { text: `${overdue} overdue`, alert: true } }),
      todos: { text: String(openTodos) },
    },
    lists: lists.map((list) => ({ id: list.id, name: list.name, count: list.openCount })),
    viewer: { name: viewer.name, image: viewer.image ?? null },
    householdName,
  };
}

/** Refetches whatever another member, or another of the person's devices, just changed */
function useRefetchOnLiveChanges() {
  const queryClient = useQueryClient();
  const router = useRouter();

  const onMessage = useCallback(
    (message: LiveMessage) => {
      if (message === "household" || message === "resync") {
        // Members, the invite code, or whether the person is still in this household at all.
        // Chores show assignees, so everything else follows.
        void router.invalidate();
        refetchEverything(queryClient);
        return;
      }
      if (message === "down") {
        // Refetching restarts polling. A refetch that fails keeps what's on screen.
        refetchEverything(queryClient);
        return;
      }
      refetchArea(queryClient, message);
    },
    [queryClient, router],
  );
  useLiveUpdates(onMessage);
}
