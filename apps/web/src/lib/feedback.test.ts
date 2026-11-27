import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// A stand-in for Sonner that keeps what's on screen. Like Sonner, dismissing a toast (or all of
// them) calls its onDismiss.
type Options = {
  description?: string;
  duration?: number;
  action?: { label: string; onClick: () => void };
  cancel?: { label: string; onClick: () => void };
  onDismiss?: () => void;
};
type Shown = { id: number; message: string; type?: string; options: Options; open: boolean };

const sonner = vi.hoisted(() => {
  const shown: Shown[] = [];
  let nextId = 0;
  const create =
    (type?: string) =>
    (message: string, options: Options): number => {
      nextId += 1;
      shown.push({ id: nextId, message, type, options, open: true });
      return nextId;
    };
  const close = (one: Shown) => {
    one.open = false;
    one.options.onDismiss?.();
  };
  const toast = Object.assign(create(), {
    info: create("info"),
    error: create("error"),
    dismiss: (id?: number) => {
      for (const one of shown.filter((each) => each.open && (id === undefined || each.id === id))) {
        close(one);
      }
    },
  });
  return { shown, toast, close };
});

vi.mock("sonner", () => ({ toast: sonner.toast }));

const onScreen = () => sonner.shown.filter((each) => each.open).map((each) => each.message);
const last = () => sonner.shown.at(-1)!;

/** The person taps its button */
function tap(toast: Shown) {
  toast.open = false;
  toast.options.action?.onClick();
}

// Each test starts with nothing on screen and no update waiting
let feedback: typeof import("./feedback.ts");
beforeEach(async () => {
  vi.useFakeTimers();
  sonner.shown.length = 0;
  vi.resetModules();
  feedback = await import("./feedback.ts");
});
afterEach(() => vi.useRealTimers());

describe("how long a toast stays", () => {
  it.each([
    ["a notice", () => feedback.notify("Groceries deleted"), 4_000],
    ["a notice with a second line", () => feedback.notify("Welcome", "Say hello"), 6_000],
    ["an Undo", () => feedback.offerUndo("Milk removed", () => {}), 6_000],
    [
      "an Undo with a second line",
      () => feedback.offerUndo("3 cleared", () => {}, { detail: "Milk, eggs and bread" }),
      8_000,
    ],
    ["a failure", () => feedback.changeFailed(new Error("offline"), "Couldn't save."), 8_000],
  ])("keeps %s on screen for its time", (_kind, show, ms) => {
    show();
    vi.advanceTimersByTime(ms - 1);
    expect(onScreen()).toHaveLength(1);
    vi.advanceTimersByTime(1);
    expect(onScreen()).toHaveLength(0);
  });

  it("leaves the timing to its own clock, not Sonner's", () => {
    feedback.notify("Groceries deleted");
    expect(last().options.duration).toBe(Number.POSITIVE_INFINITY);
  });
});

describe("one toast at a time", () => {
  it("replaces the toast on screen, saving the change an Undo in it held back", () => {
    const onUndo = vi.fn();
    const onCommit = vi.fn();
    feedback.offerUndo("Bins out deleted", onUndo, { onCommit });
    feedback.notify("Groceries deleted");

    expect(onScreen()).toEqual(["Groceries deleted"]);
    expect(onCommit).toHaveBeenCalledOnce();
    expect(onUndo).not.toHaveBeenCalled();
  });

  it("saves the change when the Undo toast times out or is swiped away, and not after Undo", () => {
    const timedOut = vi.fn();
    feedback.offerUndo("Bins out deleted", () => {}, { onCommit: timedOut });
    vi.advanceTimersByTime(6_000);
    expect(timedOut).toHaveBeenCalledOnce();

    const swiped = vi.fn();
    feedback.offerUndo("Mop deleted", () => {}, { onCommit: swiped });
    sonner.close(last());
    expect(swiped).toHaveBeenCalledOnce();

    const undone = vi.fn();
    const notCommitted = vi.fn();
    feedback.offerUndo("Vacuum deleted", undone, { onCommit: notCommitted });
    tap(last());
    vi.advanceTimersByTime(10_000);
    expect(undone).toHaveBeenCalledOnce();
    expect(notCommitted).not.toHaveBeenCalled();
  });
});

describe("the update prompt", () => {
  it("waits for the toast on screen, and steps aside for a new one", () => {
    const onLater = vi.fn();
    feedback.notify("Groceries deleted");
    feedback.offerUpdate(() => {}, onLater);
    expect(onScreen()).toEqual(["Groceries deleted"]);

    vi.advanceTimersByTime(4_000);
    expect(onScreen()).toEqual(["A new version of taskhold is ready"]);

    feedback.notifyAction("Moved to Chores", { label: "View", onClick: () => {} });
    expect(onScreen()).toEqual(["Moved to Chores"]);
    expect(onLater).not.toHaveBeenCalled();

    tap(last());
    expect(onScreen()).toEqual(["A new version of taskhold is ready"]);
  });

  it("counts swiping it away as Later, and isn't offered twice", () => {
    const onLater = vi.fn();
    feedback.offerUpdate(() => {}, onLater);
    feedback.offerUpdate(() => {}, onLater);
    expect(onScreen()).toHaveLength(1);

    sonner.close(last());
    expect(onLater).toHaveBeenCalledOnce();

    feedback.notify("Groceries deleted");
    vi.advanceTimersByTime(4_000);
    expect(onScreen()).toHaveLength(0);
  });
});

describe("pausing while someone reads it", () => {
  // Just enough of a browser for the listeners: a toast element and the events that reach it
  class FakeElement {
    readonly inToast: boolean;
    constructor(inToast: boolean) {
      this.inToast = inToast;
    }
    closest() {
      return this.inToast ? this : null;
    }
  }
  const listeners = new Map<string, ((event: object) => void)[]>();
  const fire = (type: string, event: object) => {
    for (const listener of listeners.get(type) ?? []) listener(event);
  };
  const toastElement = new FakeElement(true);
  const page = new FakeElement(false);

  beforeEach(async () => {
    listeners.clear();
    vi.stubGlobal("Element", FakeElement);
    vi.stubGlobal("window", { matchMedia: () => ({ matches: false }) });
    vi.stubGlobal("document", {
      hidden: false,
      addEventListener: (type: string, listener: (event: object) => void) => {
        listeners.set(type, [...(listeners.get(type) ?? []), listener]);
      },
    });
    vi.resetModules();
    feedback = await import("./feedback.ts");
  });
  afterEach(() => vi.unstubAllGlobals());

  it("holds the time while keyboard focus is in the toast", () => {
    feedback.notify("Groceries deleted");
    vi.advanceTimersByTime(3_000);
    fire("focusin", { target: toastElement });
    vi.advanceTimersByTime(10_000);
    expect(onScreen()).toHaveLength(1);

    fire("focusout", { relatedTarget: page });
    vi.advanceTimersByTime(999);
    expect(onScreen()).toHaveLength(1);
    vi.advanceTimersByTime(1);
    expect(onScreen()).toHaveLength(0);
  });

  it("doesn't count a phone's tap as hovering, so the toast still goes", () => {
    feedback.notify("Groceries deleted");
    fire("pointerdown", { target: toastElement });
    fire("pointerup", {});
    fire("mouseover", { target: toastElement });
    vi.advanceTimersByTime(4_000);
    expect(onScreen()).toHaveLength(0);
  });
});
