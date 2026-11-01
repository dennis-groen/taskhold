import { queryOptions } from "@tanstack/react-query";

import { errorCode } from "@/lib/api-client.ts";
import { isLive } from "@/lib/live-updates.ts";

import { fetchList, fetchLists } from "./shopping.api.ts";

// Everything under ["shopping"] is refetched after a change, so counts on the dashboard stay right
export const shoppingKeys = {
  all: ["shopping"] as const,
  lists: () => [...shoppingKeys.all, "lists"] as const,
  list: (listId: string) => [...shoppingKeys.all, "list", listId] as const,
};

export const listsQuery = () =>
  queryOptions({
    queryKey: shoppingKeys.lists(),
    queryFn: fetchLists,
  });

/** How often an open list checks for changes from other members while live updates are down */
const LIST_POLL_INTERVAL = 5_000;

export const listQuery = (listId: string) =>
  queryOptions({
    queryKey: shoppingKeys.list(listId),
    queryFn: () => fetchList(listId),
    // Changes from others normally arrive through live updates. Without them it polls, pausing while
    // the tab is hidden. Stops once someone deletes the list, since every poll would fail the same way.
    refetchInterval: (query) =>
      isLive() || isListGone(query.state.error) ? false : LIST_POLL_INTERVAL,
    retry: (failureCount, error) => !isListGone(error) && failureCount < 3,
  });

/** True when the list was deleted, or never belonged to this household */
export function isListGone(error: unknown): boolean {
  return errorCode(error) === "LIST_NOT_FOUND";
}
