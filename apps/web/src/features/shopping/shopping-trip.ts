import { isUnreachable } from "@/lib/api.ts";

import type { ShoppingItem, ShoppingTrip } from "./shopping.api.ts";

/** How many items other people added after the trip started */
export function addedSince(
  items: readonly Pick<ShoppingItem, "createdAt" | "addedBy">[],
  trip: Pick<ShoppingTrip, "startedAt">,
  viewerId: string,
): number {
  const left = Temporal.Instant.from(trip.startedAt);
  return items.filter(
    (item) =>
      Temporal.Instant.compare(Temporal.Instant.from(item.createdAt), left) > 0 &&
      item.addedBy?.id !== viewerId,
  ).length;
}

/** "left just now", "left 5 min ago" */
export function leftAgo(trip: Pick<ShoppingTrip, "startedAt">, now: Temporal.Instant): string {
  const minutes = Math.floor(
    now.since(Temporal.Instant.from(trip.startedAt), { largestUnit: "minute" }).minutes,
  );
  return minutes < 1 ? "left just now" : `left ${minutes} min ago`;
}

/**
 * What to say when "I'm going shopping" fails. The app can think it's online with no signal in a
 * shop, so a request that never got through says so, rather than sounding like the push failed.
 */
export function tripStartFailure(error: unknown): string {
  return isUnreachable(error)
    ? "No connection, so nobody was told. Check your signal and try again."
    : "Couldn't start your trip, so nobody was told. Try again.";
}
