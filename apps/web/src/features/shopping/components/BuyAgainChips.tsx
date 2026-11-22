import { CheckIcon, PlusIcon } from "@/components/icons.ts";
import { Button } from "@/components/ui/button";
import { cn } from "cn";

export type BuyAgainChip = {
  name: string;
  /** True when tapped in this session and still waiting on the list; tapping again takes it off */
  added?: boolean;
  /** Quantity carried from what's being typed, e.g. "2" while typing "2 mi" */
  quantity?: string | null;
};

/**
 * Past buys as a row of chips. Tapping one adds it; when `onUndo` is passed, a tapped chip stays
 * in place as "✓ Name" so neighbouring chips don't jump under the thumb, and tapping again takes it
 * back off. A tap doesn't take focus from a field nearby, so the keyboard stays up. The row scrolls
 * sideways rather than wrapping, and fades at its edges so it's clear there's more.
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
  if (chips.length === 0) return null;
  return (
    <ul
      aria-label={label}
      className={cn(
        "flex gap-2 overflow-x-auto overscroll-x-contain [mask-image:linear-gradient(to_right,transparent,black_0.75rem,black_calc(100%-0.75rem),transparent)] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden",
        className,
      )}
    >
      {chips.map(({ name, added = false, quantity }) => (
        <li
          key={name}
          className="shrink-0 transition-[opacity,scale] duration-200 ease-(--ease-out) starting:scale-95 starting:opacity-0"
        >
          <Button
            type="button"
            variant="chip"
            aria-pressed={onUndo ? added : undefined}
            aria-label={
              added ? `Remove ${name}` : quantity ? `Add ${quantity} ${name}` : `Add ${name}`
            }
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => (added && onUndo ? onUndo(name) : onPick(name))}
            className="h-10 max-w-56 gap-1.5 pr-4 pl-3 active:scale-[0.96]"
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
            {quantity && !added && (
              <span className="shrink-0 text-xs font-semibold text-muted-foreground">
                · {quantity}
              </span>
            )}
          </Button>
        </li>
      ))}
    </ul>
  );
}
