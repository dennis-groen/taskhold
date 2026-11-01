import { queryOptions } from "@tanstack/react-query";

import { errorCode } from "@/lib/api-client.ts";
import { isLive } from "@/lib/live-updates.ts";

import { fetchChore, fetchChores } from "./chores.api.ts";

// Everything under ["chores"] is refetched after a change
export const choreKeys = {
  all: ["chores"] as const,
  list: () => [...choreKeys.all, "list"] as const,
  detail: (choreId: string) => [...choreKeys.all, "detail", choreId] as const,
};

/** How often the chores page checks for changes from other members while live updates are down */
const CHORES_POLL_INTERVAL = 10_000;

export const choresQuery = () =>
  queryOptions({
    queryKey: choreKeys.list(),
    queryFn: fetchChores,
    // Changes from others normally arrive through live updates. Without them it polls, pausing
    // while the tab is hidden.
    refetchInterval: () => (isLive() ? false : CHORES_POLL_INTERVAL),
  });

export const choreQuery = (choreId: string) =>
  queryOptions({
    queryKey: choreKeys.detail(choreId),
    queryFn: () => fetchChore(choreId),
    retry: (failureCount, error) => !isChoreGone(error) && failureCount < 3,
  });

/** True when someone deleted the chore */
export function isChoreGone(error: unknown): boolean {
  return errorCode(error) === "CHORE_NOT_FOUND";
}
