// Toasts: the brief slips above the dock. Every one in the app goes through here (lint enforces
// it), so they follow the rules in apps/web/DESIGN.md ("Toasts"): when one shows at all, how long
// it stays, and only one at a time.
import { toast } from "sonner";

import { errorMessage } from "./api.ts";

type ToastKind = "notice" | "action" | "failure";

// How long each kind stays, with one line and with a second line
const SHOWN_FOR_MS: Record<ToastKind, readonly [oneLine: number, twoLines: number]> = {
  notice: [4_000, 6_000],
  action: [6_000, 8_000],
  failure: [8_000, 8_000],
};

type ToastId = string | number;

/** The toast on screen, if any */
let current: ToastId | undefined;

/** The update prompt, while it waits for the person: hidden whenever another toast shows */
let waitingUpdate: { onReload: () => void; onLater: () => void; hidden: boolean } | null = null;

/**
 * Shows a toast in place of the one on screen. The one it replaces closes as if it timed out, so
 * an Undo in it is saved.
 */
function show(
  kind: ToastKind,
  message: string,
  detail: string | undefined,
  options: {
    type?: "info" | "error";
    action?: ToastAction;
    /** Runs when it closes without its action: timed out, swiped away or replaced */
    onClose?: () => void;
  } = {},
): void {
  if (waitingUpdate) waitingUpdate.hidden = true;
  // Cleared first, so the toast being replaced doesn't count as gone and bring the update back
  current = undefined;
  stopClock();
  toast.dismiss();
  const { type, action, onClose } = options;
  const create = type ? toast[type] : toast;
  const closedWithoutAction = () => {
    onClose?.();
    closed(id);
  };
  const id: ToastId = create(message, {
    description: detail,
    // The clock below times it, so Sonner's own timer never runs
    duration: Number.POSITIVE_INFINITY,
    ...(action && {
      action: {
        label: action.label,
        onClick: () => {
          action.onClick();
          closed(id);
        },
      },
    }),
    onDismiss: closedWithoutAction,
  });
  current = id;
  startClock(id, SHOWN_FOR_MS[kind][detail ? 1 : 0]);
}

/** A toast went (timed out, swiped away, tapped): the update prompt can come back */
function closed(id: ToastId) {
  if (id !== current) return;
  current = undefined;
  stopClock();
  if (waitingUpdate?.hidden) showUpdate();
}

/*
 * The clock that closes a toast. Sonner has one too, but it doesn't stop for keyboard focus, and
 * on a phone a tap on the toast's text counts as a hover that pauses it until the next tap
 * elsewhere. This one pauses while someone reads or reaches for the toast: a finger on it, a mouse
 * over it, keyboard focus in it, or the app in the background.
 */
type Hold = "pointer" | "hover" | "focus" | "hidden";
const holds = new Set<Hold>();
let clock: {
  id: ToastId;
  left: number;
  since: number;
  timer?: ReturnType<typeof setTimeout>;
} | null = null;

function startClock(id: ToastId, ms: number) {
  watchForReaders();
  clock = { id, left: ms, since: performance.now() };
  runClock();
}

function stopClock() {
  if (clock?.timer !== undefined) clearTimeout(clock.timer);
  clock = null;
}

/** Counts down while nothing holds the toast, and stops (keeping the time left) while something does */
function runClock() {
  if (!clock) return;
  if (clock.timer !== undefined) {
    clearTimeout(clock.timer);
    clock.timer = undefined;
    clock.left -= performance.now() - clock.since;
  }
  if (holds.size > 0) return;
  const { id } = clock;
  clock.since = performance.now();
  clock.timer = setTimeout(
    () => {
      clock = null;
      // Calls its onDismiss, which closes it like a swipe would
      toast.dismiss(id);
    },
    Math.max(0, clock.left),
  );
}

function setHold(hold: Hold, on: boolean) {
  if (holds.has(hold) === on) return;
  if (on) holds.add(hold);
  else holds.delete(hold);
  runClock();
}

let watching = false;

function inToast(node: EventTarget | null) {
  return node instanceof Element && node.closest("[data-sonner-toast]") !== null;
}

function watchForReaders() {
  if (watching || typeof document === "undefined") return;
  watching = true;
  // A phone's tap also fires mouse events; only a real mouse hovers
  const mouse = window.matchMedia("(hover: hover) and (pointer: fine)");

  document.addEventListener(
    "pointerdown",
    (event) => {
      if (inToast(event.target)) setHold("pointer", true);
    },
    true,
  );
  for (const type of ["pointerup", "pointercancel"] as const) {
    document.addEventListener(type, () => setHold("pointer", false), true);
  }
  document.addEventListener("mouseover", (event) => {
    if (mouse.matches) setHold("hover", inToast(event.target));
  });
  document.addEventListener("mouseout", (event) => {
    if (event.relatedTarget === null) setHold("hover", false);
  });
  document.addEventListener("focusin", (event) => setHold("focus", inToast(event.target)));
  document.addEventListener("focusout", (event) => setHold("focus", inToast(event.relatedTarget)));
  setHold("hidden", document.hidden);
  document.addEventListener("visibilitychange", () => setHold("hidden", document.hidden));
}

/** A toast's one button: "Undo", "View" */
type ToastAction = { label: string; onClick: () => void };

/**
 * A brief notice after a change that can be taken back, e.g. "Milk removed". Pass `onCommit` for
 * a change that should only reach the server once the toast closes without Undo.
 */
export function offerUndo(
  message: string,
  onUndo: () => void,
  { detail, onCommit }: { detail?: string; onCommit?: () => void } = {},
): void {
  let settled = false;
  const commit = () => {
    if (settled) return;
    settled = true;
    onCommit?.();
  };
  show("action", message, detail, {
    action: {
      label: "Undo",
      onClick: () => {
        if (settled) return;
        settled = true;
        onUndo();
      },
    },
    onClose: commit,
  });
}

/**
 * A brief notice for a result that isn't on screen, e.g. after a dialog took the person somewhere
 * else ("Groceries deleted"). Not for changes the screen already shows.
 */
export function notify(message: string, detail?: string): void {
  show("notice", message, detail);
}

/** A notice about a housemate, with the info icon: "Sam is already out shopping" */
export function inform(message: string, detail?: string): void {
  show("notice", message, detail, { type: "info" });
}

/** A brief notice with a single follow-up action, e.g. "Moved to Chores" · "View" */
export function notifyAction(message: string, action: ToastAction, detail?: string): void {
  show("action", message, detail, { action });
}

/**
 * Says that a change made in the background (a tap, a swipe) didn't save. Errors in forms and
 * dialogs stay next to the form.
 */
export function changeFailed(err: unknown, fallback: string): void {
  show("failure", errorMessage(err, fallback), undefined, { type: "error" });
}

/**
 * Offers a new version of the app. It stays until the person picks, and steps aside while another
 * toast shows. Swiping it away counts as Later.
 */
export function offerUpdate(onReload: () => void, onLater: () => void): void {
  if (waitingUpdate) return;
  waitingUpdate = { onReload, onLater, hidden: current !== undefined };
  if (!waitingUpdate.hidden) showUpdate();
}

function showUpdate() {
  const offer = waitingUpdate;
  if (!offer) return;
  offer.hidden = false;
  const later = () => {
    if (offer.hidden || waitingUpdate !== offer) return;
    waitingUpdate = null;
    offer.onLater();
  };
  toast("A new version of taskhold is ready", {
    description: "Reload to get the latest.",
    duration: Number.POSITIVE_INFINITY,
    action: { label: "Reload", onClick: () => offer.onReload() },
    cancel: { label: "Later", onClick: later },
    onDismiss: later,
  });
}
