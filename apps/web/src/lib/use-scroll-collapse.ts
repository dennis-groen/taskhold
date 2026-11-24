import { useEffect, useRef, useState } from "react";

/** How far the page must move one way before the dock folds or comes back, so jitter doesn't flip it */
const THRESHOLD = 24;
/** Near the top or the bottom of the page the dock always shows */
const EDGE = 8;
/** A page that scrolls less than this has nothing to gain from folding, and would only flicker */
const MIN_SCROLL = 160;

/** Where the page is, read once per frame */
export type ScrollFrame = {
  y: number;
  /** The furthest the page can scroll */
  max: number;
  /** The visible height, which shrinks while the keyboard is up */
  viewport: number;
  /** A sheet or dialog has locked the page */
  locked: boolean;
};

export type ScrollTrack = {
  collapsed: boolean;
  /** Where counting started: the last turn, or the last time the page moved by itself */
  anchor: number;
  last: number;
  down: boolean;
  max: number;
  viewport: number;
};

export const START: ScrollTrack = {
  collapsed: false,
  anchor: 0,
  last: 0,
  down: true,
  max: 0,
  viewport: 0,
};

/**
 * One scroll step: folds after scrolling down a little way, unfolds after scrolling up a little
 * way, and stays unfolded at either end of the page (where "Clear ticked" sits) and on pages too
 * short to need it.
 *
 * Only scrolling counts. When the page moves by itself (a finished aisle folds above the view, a
 * housemate's item arrives, the keyboard comes or goes, a sheet locks the page and puts it back,
 * the router restores a position) counting starts afresh from where it lands, so the dock doesn't
 * fold or unfold on its own.
 */
export function trackScroll(prev: ScrollTrack, frame: ScrollFrame): ScrollTrack {
  const { y, max, viewport, locked } = frame;
  const moved = { last: y, max, viewport };
  // Behind a sheet nothing changes; it picks up from wherever the page is when the sheet closes
  if (locked) return { ...prev, ...moved, anchor: y };

  let collapsed = prev.collapsed;
  if (max < MIN_SCROLL || y <= EDGE || y >= max - EDGE) collapsed = false;

  const delta = y - prev.last;
  const shifted = max !== prev.max || viewport !== prev.viewport || Math.abs(delta) > viewport / 2;
  if (shifted || delta === 0) {
    return { ...prev, ...moved, collapsed, anchor: shifted ? y : prev.anchor };
  }

  const down = delta > 0;
  const anchor = down === prev.down ? prev.anchor : prev.last;
  if (collapsed === prev.collapsed) {
    if (down && y - anchor > THRESHOLD && max >= MIN_SCROLL && y < max - EDGE) collapsed = true;
    else if (!down && anchor - y > THRESHOLD) collapsed = false;
  }
  return { ...moved, collapsed, anchor, down };
}

function overflowHidden(element: HTMLElement): boolean {
  return /hidden|clip/.test(getComputedStyle(element).overflowY);
}

/** Whether a modal (sheet, dialog) has locked the page; base-ui hides overflow on <html> or <body> */
function pageLocked(): boolean {
  return overflowHidden(document.documentElement) || overflowHidden(document.body);
}

function readFrame(): ScrollFrame {
  return {
    y: window.scrollY,
    max: document.documentElement.scrollHeight - window.innerHeight,
    viewport: Math.round(window.visualViewport?.height ?? window.innerHeight),
    locked: pageLocked(),
  };
}

/**
 * Whether the page has been scrolled down far enough to fold the dock out of the way, and a way to
 * unfold it again by hand. Always false while `enabled` is off; turning it back on starts counting
 * from where the page is then.
 */
export function useScrollCollapse(enabled: boolean): [collapsed: boolean, expand: () => void] {
  const [collapsed, setCollapsed] = useState(false);
  // Shared with expand(), so unfolding by hand starts counting afresh from where the page is
  const track = useRef(START);

  useEffect(() => {
    if (!enabled) return undefined;
    const { y, max, viewport } = readFrame();
    track.current = { ...START, anchor: y, last: y, max, viewport };
    let frame = 0;
    const step = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        track.current = trackScroll(track.current, readFrame());
        setCollapsed(track.current.collapsed);
      });
    };
    window.addEventListener("scroll", step, { passive: true });
    // The keyboard and the browser's toolbars change the viewport without a scroll; noting it
    // here keeps their own scroll from being counted as the person's
    window.visualViewport?.addEventListener("resize", step);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("scroll", step);
      window.visualViewport?.removeEventListener("resize", step);
      setCollapsed(false);
    };
  }, [enabled]);

  function expand() {
    track.current = { ...track.current, collapsed: false, anchor: track.current.last };
    setCollapsed(false);
  }

  return [enabled && collapsed, expand];
}
