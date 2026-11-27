// Deleting a chore deletes its history too, so Undo can't make it again the way it does a to-do.
// Instead the delete waits: the chores leave the screen at once, and the delete is sent only once
// the Undo toast closes without Undo (docs/adr/0001-chore-deletes-wait-for-the-undo-window.md).
import { useSyncExternalStore } from "react";

import { offerUndo } from "@/lib/feedback.ts";

import type { Chore } from "./chores.api.ts";

let heldIds: ReadonlySet<string> = new Set();
const listeners = new Set<() => void>();

function setHeld(ids: readonly string[], held: boolean) {
  const next = new Set(heldIds);
  for (const id of ids) {
    if (held) next.add(id);
    else next.delete(id);
  }
  heldIds = next;
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** `chores` without the ones waiting out their Undo before they're deleted */
export function useWithoutHeld(chores: readonly Chore[]): Chore[] {
  const held = useSyncExternalStore(subscribe, () => heldIds);
  return chores.filter((chore) => !held.has(chore.id));
}

/**
 * Takes the chores off the screen and offers Undo. `send` deletes them once the toast closes
 * without Undo; they're let go of once that's saved, or rolled back by the change.
 */
export function deleteAfterUndo(
  ids: readonly string[],
  message: string,
  send: () => Promise<unknown>,
): void {
  if (ids.length === 0) return;
  setHeld(ids, true);
  offerUndo(message, () => setHeld(ids, false), {
    onCommit: () => {
      // Offline, this waits for a connection; they stay off the screen meanwhile
      send()
        .catch(() => {})
        .finally(() => setHeld(ids, false));
    },
  });
}
