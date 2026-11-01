import { queryOptions } from "@tanstack/react-query";

import { errorCode } from "@/lib/api-client.ts";

import { fetchChore, fetchChores } from "./chores.api.ts";

// Everything under ["chores"] is refetched after a change
export const choreKeys = {
  all: ["chores"] as const,
  list: () => [...choreKeys.all, "list"] as const,
  detail: (choreId: string) => [...choreKeys.all, "detail", choreId] as const,
};

/** How often the chores page checks for changes from other members */
const CHORES_POLL_INTERVAL = 10_000;

export const choresQuery = () =>
  queryOptions({
    queryKey: choreKeys.list(),
    queryFn: fetchChores,
    // Pauses while the tab is hidden and refetches when it's visible again
    refetchInterval: CHORES_POLL_INTERVAL,
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
