import { BasketIcon } from "@/components/icons.ts";
import { Button } from "@/components/ui/button";
import { firstName, type PersonSummary } from "@/lib/shared-with.ts";

import type { ShoppingItem } from "../shopping.api.ts";
import { useShoppingTrip } from "../shopping.hooks.ts";
import { addedSince, leftAgo } from "../shopping-trip.ts";

/**
 * Under the list's header: the button that lets the household know you're off to the shop, and
 * while someone is out, a quiet line saying so. Starting needs a connection (see useShoppingTrip).
 */
export function ShoppingTripBar({
  listId,
  viewer,
  items,
}: {
  listId: string;
  viewer: PersonSummary;
  items: readonly ShoppingItem[];
}) {
  const { trip, mine, start, end, starting, online } = useShoppingTrip(listId, viewer);

  if (!trip) {
    return (
      <div className="px-1 pt-3">
        <Button
          variant="secondary"
          size="lg"
          className="min-h-11 w-full"
          disabled={!online || starting}
          onClick={start}
        >
          <BasketIcon aria-hidden />
          I&apos;m going shopping
        </Button>
        {!online && (
          <p className="pt-1.5 text-center text-[0.8125rem] text-muted-foreground">
            Connect to let everyone know
          </p>
        )}
      </div>
    );
  }

  if (mine) {
    const added = addedSince(items, trip, viewer.id);
    return (
      <div className="flex items-center justify-between gap-3 px-1 pt-3 text-[0.9375rem] text-muted-foreground">
        <output>
          You&apos;re out shopping
          {added > 0 && <> · {added} added since you left</>}
        </output>
        <Button variant="ghost" size="sm" className="min-h-11 shrink-0" onClick={end}>
          I&apos;m done
        </Button>
      </div>
    );
  }

  return (
    <output className="block px-1 pt-3 text-[0.9375rem] text-muted-foreground">
      {firstName(trip.shopper?.name ?? "Someone")} is out shopping ·{" "}
      {leftAgo(trip, Temporal.Now.instant())}
    </output>
  );
}
