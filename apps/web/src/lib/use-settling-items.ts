import { useEffect, useLayoutEffect, useRef, useState } from "react";

// How long after the last tap ticked rows stay put before moving to where done things go
const SETTLE_AFTER = Temporal.Duration.from({ milliseconds: 2_500 });
// How long settled rows take to fold away, so it's clear where they went
const LEAVE = { duration: 300, easing: "cubic-bezier(0.4, 0, 0.2, 1)" };

/**
 * Rows this person just ticked off (shopping items, chores, to-dos), which stay where they are
 * (crossed out) until they stop tapping for a moment, then fold away together: to the cart, or
 * to Done. A wrong tick can be taken back where
 * it is, and rows don't shift under the next tap.
 *
 * Put `listRef` on the list, and `data-settling` on rows whose id is in `settling`. A part of
 * the list marked `data-settle-group` (a category with its heading) folds away as one when every
 * row in it is leaving.
 */
export function useSettlingItems() {
  const [settling, setSettling] = useState<ReadonlySet<string>>(() => new Set());
  const listRef = useRef<HTMLDivElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const leaving = useRef<Animation[]>([]);

  useEffect(() => () => clearTimeout(timer.current), []);

  // Folded rows keep their folded look until the list has updated, so they don't flash back
  // before they go. Most are gone by then. One that stays where it was (a repeating chore whose
  // next date is in the same group) would stay folded for good, so the look is dropped here,
  // after the update and before the browser paints.
  useLayoutEffect(() => {
    if (settling.size > 0) return;
    for (const animation of leaving.current) animation.cancel();
    leaving.current = [];
  }, [settling]);

  /**
   * Call on every tick or untick: each one restarts the wait. An untick keeps the item held too:
   * the list only learns it's unticked a moment later, and letting go first would flash it into
   * the cart.
   */
  function touched(itemId: string) {
    // A tap while rows fold away puts them back and waits again
    for (const animation of leaving.current) animation.cancel();
    leaving.current = [];
    setSettling((current) => new Set(current).add(itemId));
    clearTimeout(timer.current);
    timer.current = setTimeout(() => void settle(), SETTLE_AFTER.total("milliseconds"));
  }

  async function settle() {
    const parts = leavingParts(listRef.current);
    const animate =
      parts.length > 0 &&
      document.visibilityState === "visible" &&
      !window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (animate) {
      const animations = parts.map((part) =>
        part.animate(
          [
            // Rows have a minimum height, so that has to fold too
            { height: `${part.offsetHeight}px`, minHeight: "0px", opacity: 1 },
            // The text fades a little before the row has folded, so nothing overlaps
            { opacity: 0, offset: 0.7 },
            { height: "0px", minHeight: "0px", opacity: 0 },
          ],
          { ...LEAVE, fill: "forwards" },
        ),
      );
      leaving.current = animations;
      try {
        await Promise.race([
          Promise.all(animations.map((animation) => animation.finished)),
          // A browser pauses animations in a hidden page; the items move to the cart regardless
          new Promise((resolve) => setTimeout(resolve, LEAVE.duration + 200)),
        ]);
      } catch {
        // Cancelled by another tap, which starts a new wait
        return;
      }
    }
    setSettling(new Set());
  }

  return { settling, touched, listRef };
}

/** The ticked rows that fold away, with a whole group in place of its rows when all of them go */
function leavingParts(list: HTMLElement | null): HTMLElement[] {
  if (!list) return [];
  const parts: HTMLElement[] = [];
  for (const group of list.querySelectorAll<HTMLElement>("[data-settle-group]")) {
    const rows = [...group.querySelectorAll<HTMLElement>("li")];
    if (rows.length > 0 && rows.every(isLeaving)) parts.push(group);
    else parts.push(...rows.filter(isLeaving));
  }
  return parts;
}

function isLeaving(row: HTMLElement): boolean {
  return row.dataset.settling === "checked";
}
