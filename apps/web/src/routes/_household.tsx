import { useQueryClient } from "@tanstack/react-query";
import {
  Outlet,
  createFileRoute,
  redirect,
  useMatchRoute,
  useRouter,
} from "@tanstack/react-router";
import { useCallback } from "react";

import { HouseholdShell } from "@/components/layout/HouseholdShell.tsx";
import { AddChoreButton } from "@/features/chores/components/AddChoreButton.tsx";
import { ViewerUnavailableError } from "@/features/auth/auth.api.ts";
import {
  fetchCurrentHousehold,
  householdSummary,
  type Household,
  type SavedHousehold,
} from "@/features/households/households.api.ts";
import { QuickAdd } from "@/features/shopping/components/QuickAdd.tsx";
import { AddTodoButton } from "@/features/todos/components/AddTodoButton.tsx";
import { useLiveUpdates, type LiveMessage } from "@/lib/live-updates.ts";
import { keepForOffline, keptForOffline } from "@/lib/offline-cache.ts";
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
  // The + adds whatever the page is about: a chore on Chores, a to-do on Personal, a shopping
  // item everywhere else
  const matchRoute = useMatchRoute();
  const addButton = matchRoute({ to: "/chores", fuzzy: true }) ? (
    <AddChoreButton members={household.members} viewerId={user.id} />
  ) : matchRoute({ to: "/personal", fuzzy: true }) ? (
    <AddTodoButton />
  ) : (
    <QuickAdd viewer={user} />
  );
  return (
    <HouseholdShell addButton={addButton}>
      <Outlet />
    </HouseholdShell>
  );
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
