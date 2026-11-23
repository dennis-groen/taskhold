import { useEffect, useState } from "react";

type KeyboardOffset = {
  /** Pixels from the bottom of the layout viewport to the top of the software keyboard */
  offset: number;
  /** Usable height above the software keyboard, clamped to keep sheets legible */
  available: number;
};

/**
 * Tracks iOS/mobile software keyboard lift through `window.visualViewport` while `active` is true,
 * so a bottom sheet can rise above the keyboard instead of shrinking underneath it.
 */
export function useKeyboardOffset(active: boolean): KeyboardOffset | null {
  const [keyboard, setKeyboard] = useState<KeyboardOffset | null>(null);
  if (!active && keyboard !== null) setKeyboard(null);

  useEffect(() => {
    if (!active) return undefined;
    const vv = window.visualViewport;
    if (!vv) return undefined;
    const sync = () => {
      const offset = Math.max(0, Math.round(window.innerHeight - vv.height - vv.offsetTop));
      const keyboardUp = window.innerHeight - vv.height > 100;
      const next = keyboardUp
        ? { offset, available: Math.max(220, Math.floor(vv.height - 32)) }
        : null;
      // visualViewport fires on every pan; only re-render when the lift actually changes
      setKeyboard((prev) =>
        prev?.offset === next?.offset && prev?.available === next?.available ? prev : next,
      );
    };
    sync();
    vv.addEventListener("resize", sync);
    vv.addEventListener("scroll", sync);
    return () => {
      vv.removeEventListener("resize", sync);
      vv.removeEventListener("scroll", sync);
    };
  }, [active]);

  return active ? keyboard : null;
}
