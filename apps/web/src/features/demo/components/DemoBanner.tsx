import { useState } from "react";

import { HandPointingIcon } from "@/components/icons.ts";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { changeFailed, notify } from "@/lib/feedback.ts";

import { askHousemate } from "../demo.api.ts";

/**
 * Across the top of every page in the demo: that it's a demo and when it's deleted, and a button
 * that has a housemate change the shopping list, so the visitor sees someone else's change arrive
 * the way it would from their phone.
 */
export function DemoBanner({ endsAt }: { endsAt: string }) {
  const [pending, setPending] = useState(false);

  async function ask() {
    setPending(true);
    try {
      const { housemate, action, item } = await askHousemate();
      notify(
        `${housemate} ${action} ${item}`,
        "It came through live updates, just as it would from their phone.",
      );
    } catch (err) {
      changeFailed(err, "Couldn't reach your housemates. Try again in a moment.");
    } finally {
      setPending(false);
    }
  }

  return (
    <aside
      aria-label="Demo"
      className="mt-3 flex items-center gap-3 rounded-2xl bg-area-tint px-4 py-2.5 lg:mt-0 lg:mb-4"
    >
      <p className="min-w-0 flex-1 text-sm leading-snug">
        <b className="font-[700]">Demo household</b>
        <span className="block text-muted-foreground">{deletedIn(endsAt)}</span>
      </p>
      <Button type="button" variant="soft" size="sm" disabled={pending} onClick={() => void ask()}>
        {pending ? <Spinner /> : <HandPointingIcon />}
        Housemate's turn
      </Button>
    </aside>
  );
}

/** "Deleted in 23 hours", rounded up, so it never says 0 while there's time left */
function deletedIn(endsAt: string): string {
  const left = Temporal.Instant.from(endsAt).since(Temporal.Now.instant());
  const hours = Math.ceil(left.total("hours"));
  if (hours <= 1) return "Deleted within the hour";
  return `Deleted in ${hours} hours`;
}
