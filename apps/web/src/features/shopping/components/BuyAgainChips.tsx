import { useCallback, useEffect, useState } from "react";

import { CheckIcon, PlusIcon } from "@/components/icons.ts";
import { Button } from "@/components/ui/button";
import { cn } from "cn";

export type BuyAgainChip = {
  name: string;
  /** True when tapped in this session and still waiting on the list; tapping again takes it off */
  added?: boolean;
  /** Quantity carried from what's being typed, or the item's usual quantity */
  quantity?: string | null;
};

/**
 * Past buys as a row of 44px chips. Tapping one adds it; when `onUndo` is passed, a tapped chip
 * stays in place as "✓ Name" so neighbouring chips don't jump under the thumb (with fixed font
 * weight so width never shifts), and tapping again takes it back off. A tap doesn't take focus
 * from a field nearby, so the keyboard stays up. Edges only fade when more is scrolled off that side.
 */
export function BuyAgainChips({
  chips,
  onPick,
  onUndo,
  label = "Buy again",
  className,
}: {
  chips: readonly BuyAgainChip[];
  onPick: (name: string) => void;
  /** When set, chips act as toggles: tapping an added chip takes it back off the list */
  onUndo?: (name: string) => void;
  /** Names the row for screen readers */
  label?: string;
  className?: string;
}) {
  // Callback ref state so observers re-attach cleanly when the chip row unmounts and remounts
  const [listEl, setListEl] = useState<HTMLUListElement | null>(null);
  const [fade, setFade] = useState({ left: false, right: false });

  const handleListRef = useCallback((el: HTMLUListElement | null) => {
    setListEl(el);
    if (!el) setFade((prev) => (!prev.left && !prev.right ? prev : { left: false, right: false }));
  }, []);

  const updateFade = useCallback((el: HTMLUListElement | null) => {
    if (!el) return;
    const left = el.scrollLeft > 2;
    const right = el.scrollLeft + el.clientWidth < el.scrollWidth - 2;
    setFade((prev) => (prev.left === left && prev.right === right ? prev : { left, right }));
  }, []);

  useEffect(() => {
    if (!listEl) return undefined;
    const sync = () => updateFade(listEl);
    sync();
    const resizeObserver = typeof ResizeObserver !== "undefined" ? new ResizeObserver(sync) : null;
    resizeObserver?.observe(listEl);
    const mutationObserver =
      typeof MutationObserver !== "undefined" ? new MutationObserver(sync) : null;
    mutationObserver?.observe(listEl, { childList: true, subtree: true });
    return () => {
      resizeObserver?.disconnect();
      mutationObserver?.disconnect();
    };
  }, [listEl, updateFade]);

  if (chips.length === 0) return null;

  const maskClass =
    fade.left && fade.right
      ? "[mask-image:linear-gradient(to_right,transparent,black_0.75rem,black_calc(100%-0.75rem),transparent)]"
      : fade.left
        ? "[mask-image:linear-gradient(to_right,transparent,black_0.75rem,black)]"
        : fade.right
          ? "[mask-image:linear-gradient(to_right,black,black_calc(100%-0.75rem),transparent)]"
          : undefined;

  return (
    <ul
      ref={handleListRef}
      aria-label={label}
      onScroll={() => updateFade(listEl)}
      className={cn(
        "flex gap-2 overflow-x-auto overscroll-x-contain [scrollbar-width:none] [&::-webkit-scrollbar]:hidden",
        maskClass,
        className,
      )}
    >
      {chips.map(({ name, added = false, quantity }) => (
        <li
          key={name}
          className="shrink-0 transition-[opacity,scale] duration-200 ease-(--ease-out) starting:scale-95 starting:opacity-0 motion-reduce:transition-none motion-reduce:starting:scale-100"
        >
          <Button
            type="button"
            variant="chip"
            // One fixed name; "pressed" alone says it's been added (a changing name would contradict it)
            aria-pressed={onUndo ? added : undefined}
            aria-label={quantity ? `Add ${quantity} ${name}` : `Add ${name}`}
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => (added && onUndo ? onUndo(name) : onPick(name))}
            className="max-w-60 gap-1.5 pr-4 pl-3 aria-pressed:font-medium active:scale-[0.96] motion-reduce:active:scale-100"
          >
            {added ? (
              <CheckIcon
                weight="bold"
                aria-hidden
                className="size-4 shrink-0 text-area-fg animate-[check-pop_220ms_var(--ease-out)] motion-reduce:animate-none"
              />
            ) : (
              <PlusIcon weight="bold" aria-hidden className="size-4 shrink-0 text-area-fg" />
            )}
            <span className="truncate">{name}</span>
            {quantity && (
              <span
                className={cn(
                  "max-w-24 shrink-0 truncate text-xs font-semibold tabular-nums",
                  added ? "text-primary-soft-foreground/80" : "text-muted-foreground",
                )}
              >
                · {quantity}
              </span>
            )}
          </Button>
        </li>
      ))}
    </ul>
  );
}
