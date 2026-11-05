import { useId } from "react";

import { Button } from "@/components/ui/button";
import { cn } from "cn";

import { CATEGORY_ICONS } from "../category-icons.ts";
import { categorize } from "../categories.ts";

/** Where the row sits: the quick-add sheet's padding, or a list card's */
const GUTTERS = {
  sheet: {
    row: "-mx-5 px-5 scroll-px-5",
    fade: "[mask-image:linear-gradient(to_right,transparent,black_1.25rem,black_calc(100%-1.25rem),transparent)]",
  },
  card: {
    row: "px-4 scroll-px-4",
    fade: "[mask-image:linear-gradient(to_right,transparent,black_1rem,black_calc(100%-1rem),transparent)]",
  },
};

/**
 * "Buy again": past buys as a row of chips, each with its aisle's icon. Tapping one adds it.
 * A tap doesn't take focus from the field above, so the keyboard stays up for the next item.
 * The row scrolls sideways rather than wrapping, so the sheet stays short above the keyboard.
 */
export function BuyAgain({
  names,
  onPick,
  gutter,
  className,
}: {
  names: string[];
  onPick: (name: string) => void;
  gutter: keyof typeof GUTTERS;
  className?: string;
}) {
  const labelId = useId();
  if (names.length === 0) return null;
  const { row, fade } = GUTTERS[gutter];

  return (
    <section aria-labelledby={labelId} className={cn("animate-in fade-in duration-150", className)}>
      <p
        id={labelId}
        className={cn(
          "pb-2 text-[0.8125rem] leading-4 font-semibold text-muted-foreground",
          gutter === "card" && "px-4",
        )}
      >
        Buy again
      </p>
      <ul
        className={cn(
          "flex gap-2 overflow-x-auto overscroll-x-contain [scrollbar-width:none] [&::-webkit-scrollbar]:hidden",
          row,
          fade,
        )}
      >
        {names.map((name) => {
          const CategoryIcon = CATEGORY_ICONS[categorize(name)];
          return (
            <li key={name} className="shrink-0">
              <Button
                type="button"
                variant="chip"
                aria-label={`Add ${name}`}
                // Keeps focus (and the phone's keyboard) on the field while adding
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => onPick(name)}
                className="max-w-56 gap-1.5 pr-4 pl-3"
              >
                <CategoryIcon
                  className="size-4 shrink-0 text-primary-soft-foreground/80"
                  weight="duotone"
                  aria-hidden
                />
                <span className="truncate">{name}</span>
              </Button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
