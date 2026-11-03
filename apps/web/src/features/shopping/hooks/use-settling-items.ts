import { useEffect, useRef, useState } from "react";

// How long after the last tap ticked items stay put before moving to the cart
const SETTLE_AFTER = Temporal.Duration.from({ milliseconds: 2_500 });
// How long settled rows take to fold away, so it's clear where they went
const LEAVE = { duration: 300, easing: "cubic-bezier(0.4, 0, 0.2, 1)" };

/**
 * Items this person just ticked off, which stay where they are (crossed out) until they stop
 * tapping for a moment, then fold away to the cart together. A wrong tick can be taken back where
 * it is, and rows don't shift under the next tap.
 *
 * Put `listRef` on the list, and `data-settling` on rows whose id is in `settling`.
 */
export function useSettlingItems() {
  const [settling, setSettling] = useState<ReadonlySet<string>>(() => new Set());
  const listRef = useRef<HTMLUListElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const leaving = useRef<Animation[]>([]);

  useEffect(() => () => clearTimeout(timer.current), []);

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
    const rows = [...(listRef.current?.querySelectorAll<HTMLElement>("[data-settling]") ?? [])];
    const ticked = rows.filter((row) => row.dataset.settling === "checked");
    const animate =
      ticked.length > 0 &&
      document.visibilityState === "visible" &&
      !window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (animate) {
      const animations = ticked.map((row) =>
        row.animate(
          [
            // Rows have a minimum height, so that has to fold too
            { height: `${row.offsetHeight}px`, minHeight: "0px", opacity: 1 },
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
    leaving.current = [];
    setSettling(new Set());
  }

  return { settling, touched, listRef };
}
