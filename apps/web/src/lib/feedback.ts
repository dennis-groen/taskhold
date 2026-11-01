import { toast } from "sonner";

import { errorMessage } from "./api-client.ts";

// Long enough to read the message and reach the button
const UNDO_MS = 6_000;

/** A brief notice after a change that can be taken back, e.g. "Milk removed" */
export function offerUndo(message: string, onUndo: () => void): void {
  toast(message, { duration: UNDO_MS, action: { label: "Undo", onClick: onUndo } });
}

/**
 * Says that a change made in the background (a tap, a swipe) didn't save. Only one shows at a
 * time, so a run of failures doesn't stack up. Errors in forms and dialogs stay next to the form.
 */
export function changeFailed(err: unknown, fallback: string): void {
  toast.error(errorMessage(err, fallback), { id: "change-failed" });
}
