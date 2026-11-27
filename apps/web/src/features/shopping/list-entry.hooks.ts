import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useSyncExternalStore } from "react";

import { useWaitingVars } from "@/lib/offline-changes.ts";
import type { PersonSummary } from "@/lib/shared-with.ts";

import {
  holdListMemory,
  listEntry,
  listMemory,
  subscribeToListMemory,
  type ListEntry,
} from "./list-entry.ts";
import { shoppingChanges } from "./shopping.changes.ts";
import { listQuery } from "./shopping.queries.ts";

/**
 * Putting things on a list from a component (see list-entry.ts). Holds the list's memory while
 * mounted, and re-renders when the memory, the list, or its waiting adds change. `addedIds` keeps
 * the same identity while its ids do, so memoised suggestions don't rerun on every render.
 */
export function useListEntry(
  listId: string,
  viewer: PersonSummary,
): Omit<ListEntry, "addedIds" | "hold"> & { addedIds: ReadonlySet<string> } {
  const queryClient = useQueryClient();
  useQuery(listQuery(listId));
  useWaitingVars(shoppingChanges.add);
  useSyncExternalStore(
    (onChange) => subscribeToListMemory(queryClient, onChange),
    () => listMemory(queryClient, listId),
  );
  useEffect(() => holdListMemory(queryClient, listId), [queryClient, listId]);

  const entry = listEntry(queryClient, listId, viewer);
  const signature = [...entry.addedIds()].toSorted().join("\0");
  const addedIds = useMemo(() => new Set(signature ? signature.split("\0") : []), [signature]);
  return { ...entry, addedIds };
}
