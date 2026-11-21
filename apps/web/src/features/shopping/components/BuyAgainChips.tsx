import { PlusIcon } from "@/components/icons.ts";
import { Button } from "@/components/ui/button";
import { cn } from "cn";

/**
 * Past buys as a row of chips, each with a +. Tapping one adds it. A tap doesn't take focus from
 * a field nearby, so the keyboard stays up for the next item. The row scrolls sideways rather
 * than wrapping, and fades at its edges so it's clear there's more.
 */
export function BuyAgainChips({
  names,
  onPick,
  label = "Buy again",
  className,
}: {
  names: string[];
  onPick: (name: string) => void;
  /** Names the row for screen readers */
  label?: string;
  className?: string;
}) {
  if (names.length === 0) return null;
  return (
    <ul
      aria-label={label}
      className={cn(
        "flex gap-2 overflow-x-auto overscroll-x-contain [mask-image:linear-gradient(to_right,transparent,black_0.75rem,black_calc(100%-0.75rem),transparent)] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden",
        className,
      )}
    >
      {names.map((name) => (
        <li
          key={name}
          className="shrink-0 transition-[opacity,scale] duration-200 ease-(--ease-out) starting:scale-95 starting:opacity-0"
        >
          <Button
            type="button"
            variant="chip"
            aria-label={`Add ${name}`}
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => onPick(name)}
            className="h-10 max-w-56 gap-1.5 pr-4 pl-3 active:scale-[0.96]"
          >
            <PlusIcon weight="bold" aria-hidden className="size-4 shrink-0 text-area-fg" />
            <span className="truncate">{name}</span>
          </Button>
        </li>
      ))}
    </ul>
  );
}
