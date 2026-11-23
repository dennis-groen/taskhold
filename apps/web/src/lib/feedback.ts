import { toast } from "sonner";

import { errorMessage } from "./api.ts";

// Long enough to read the message and reach the button
const UNDO_MS = 6_000;

/**
 * A brief notice after a change that can be taken back, e.g. "Milk removed". Pass `onCommit` for
 * destructive actions that should wait until the undo window closes before running on the server.
 */
export function offerUndo(
  message: string,
  onUndo: () => void,
  detail?: string,
  onCommit?: () => void,
): void {
  let settled = false;
  const commit = () => {
    if (settled) return;
    settled = true;
    onCommit?.();
  };
  toast(message, {
    description: detail,
    duration: UNDO_MS,
    action: {
      label: "Undo",
      onClick: () => {
        if (settled) return;
        settled = true;
        onUndo();
      },
    },
    onAutoClose: commit,
    onDismiss: commit,
  });
}

/**
 * A brief confirmation for something that can't be seen on screen any more, e.g. after a dialog
 * took the person somewhere else ("Groceries deleted"). Not for changes the screen already shows.
 */
export function notify(message: string, detail?: string): void {
  toast(message, { description: detail });
}

/** A brief confirmation with a single follow-up action, e.g. "Added 4 to Groceries" · "View" */
export function notifyAction(message: string, actionLabel: string, onAction: () => void): void {
  toast(message, {
    duration: 4_500,
    action: { label: actionLabel, onClick: onAction },
  });
}

/**
 * Says that a change made in the background (a tap, a swipe) didn't save. Only one shows at a
 * time, so a run of failures doesn't stack up. Errors in forms and dialogs stay next to the form.
 */
export function changeFailed(err: unknown, fallback: string): void {
  toast.error(errorMessage(err, fallback), { id: "change-failed" });
}
