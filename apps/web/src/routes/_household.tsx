import { useQueryClient } from "@tanstack/react-query";
import {
  Outlet,
  createFileRoute,
  redirect,
  useMatchRoute,
  useRouter,
} from "@tanstack/react-router";
import { useCallback } from "react";

import { HouseholdShell } from "@/components/layout/household-shell.tsx";
import { choreKeys } from "@/features/chores/chores.queries.ts";
import { AddChoreButton } from "@/features/chores/components/add-chore-button.tsx";
import { fetchCurrentHousehold } from "@/features/households/households.api.ts";
import { QuickAdd } from "@/features/shopping/components/quick-add.tsx";
import { shoppingKeys } from "@/features/shopping/shopping.queries.ts";
import { AddTodoButton } from "@/features/todos/components/add-todo-button.tsx";
import { todoKeys } from "@/features/todos/todos.queries.ts";
import { useLiveUpdates, type LiveMessage } from "@/lib/live-updates.ts";

// Pages for people who belong to a household; loads that household once for all of them
export const Route = createFileRoute("/_household")({
  beforeLoad: ({ context }) => {
    const { user, household } = context.viewer;
    if (!user) throw redirect({ to: "/" });
    if (!household) throw redirect({ to: "/onboarding" });
    return { user };
  },
  loader: () => fetchCurrentHousehold(),
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

const TOPIC_KEYS = { shopping: shoppingKeys.all, chores: choreKeys.all, todos: todoKeys.all };

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
        void queryClient.invalidateQueries();
        return;
      }
      const queryKey = TOPIC_KEYS[message];
      // The person's own change is still being saved. Refetching now would briefly undo it on
      // screen, and the change refetches when it's done anyway.
      if (queryClient.isMutating({ mutationKey: queryKey }) > 0) return;
      void queryClient.invalidateQueries({ queryKey });
    },
    [queryClient, router],
  );
  useLiveUpdates(onMessage);
}
