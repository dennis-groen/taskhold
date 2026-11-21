// "Left-handed layout": a setting kept on this device only that puts each row's round button on
// the left. Rows read it through the `ticks-left:` variant (styles/globals.css), which follows
// data-ticks on <html>.
import { useSyncExternalStore } from "react";

export type TickSide = "right" | "left";

const KEY = "taskhold:ticks";
const listeners = new Set<() => void>();

function read(): TickSide {
  try {
    return localStorage.getItem(KEY) === "left" ? "left" : "right";
  } catch {
    // Storage blocked (private mode): the default
    return "right";
  }
}

/** Puts the setting on <html>; call once at startup, before the first paint */
export function applyTickSide(side: TickSide = read()): void {
  if (side === "left") document.documentElement.dataset.ticks = "left";
  else delete document.documentElement.dataset.ticks;
}

/** The side ticks sit on, and a way to change it on this device */
export function useTickSide(): [TickSide, (side: TickSide) => void] {
  const side = useSyncExternalStore(
    (onChange) => {
      listeners.add(onChange);
      return () => listeners.delete(onChange);
    },
    read,
    (): TickSide => "right",
  );
  function set(next: TickSide) {
    try {
      localStorage.setItem(KEY, next);
    } catch {
      // Not kept, but still applies until the app is closed
    }
    applyTickSide(next);
    for (const listener of listeners) listener();
  }
  return [side, set];
}
