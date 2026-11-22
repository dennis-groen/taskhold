import { useId, useLayoutEffect, useRef, type ReactNode } from "react";

import { CaretDownIcon, CheckCircleIcon } from "@/components/icons.ts";
import { cn } from "cn";

import type { Category } from "../categories.ts";
import { CATEGORY_ICONS } from "../category-icons.ts";

/**
 * One supermarket category as its own card on the warm canvas, so aisles separate at a glance.
 * Once every item in the section is ticked and settled, the header becomes a button that folds
 * the rows away until tapped. Lists with no recognised categories render a headerless card.
 */
export function CategorySection({
  category,
  left,
  total,
  folded,
  canFold,
  onToggleFold,
  children,
}: {
  category: Category | null;
  left: number;
  total: number;
  folded: boolean;
  /** True once the section has settled into all-ticked state and can be toggled open/closed */
  canFold: boolean;
  onToggleFold: () => void;
  children: ReactNode;
}) {
  const panelId = useId();
  const headerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  // If keyboard or screen-reader focus is still on the checkbox that just triggered an auto-fold,
  // move focus onto the header button before `inert` drops it to <body>.
  useLayoutEffect(() => {
    if (folded && panelRef.current?.contains(document.activeElement)) {
      headerRef.current?.focus({ preventScroll: true });
    }
  }, [folded]);

  if (category === null) {
    return (
      <section aria-label="To buy" className="overflow-clip rounded-[20px] bg-card shadow-card">
        <ul>{children}</ul>
      </section>
    );
  }

  const CategoryIcon = CATEGORY_ICONS[category];
  const muted = canFold;
  const done = left === 0;

  const headerContent = (
    <>
      <span className="flex min-w-0 items-center gap-2.5">
        <span
          aria-hidden
          className={cn(
            "grid size-7 shrink-0 place-items-center rounded-[9px] transition-colors duration-200 ease-(--ease-out)",
            muted ? "bg-muted text-muted-foreground" : "bg-area-tint text-area-fg",
          )}
        >
          <CategoryIcon weight="bold" className="size-4" />
        </span>
        <span
          className={cn(
            "truncate text-[0.9375rem] font-[780] tracking-[-0.01em] transition-colors duration-200 ease-(--ease-out) [font-stretch:112%]",
            muted && "text-muted-foreground",
          )}
        >
          {category}
        </span>
      </span>
      {done ? (
        <span className="flex shrink-0 items-center gap-1.5 text-[0.8125rem] font-semibold text-muted-foreground tabular-nums">
          <CheckCircleIcon aria-hidden weight="fill" className="size-4 text-area-fg" />
          <span>{total} ticked</span>
          {canFold && (
            <CaretDownIcon
              aria-hidden
              weight="bold"
              className={cn(
                "size-3.5 transition-transform duration-240 ease-(--ease-in-out) motion-reduce:duration-0",
                !folded && "rotate-180",
              )}
            />
          )}
        </span>
      ) : (
        <span className="shrink-0 text-[0.8125rem] font-semibold text-muted-foreground tabular-nums">
          {left} left
        </span>
      )}
    </>
  );

  return (
    <section className="overflow-clip rounded-[20px] bg-card shadow-card">
      <h2>
        {canFold ? (
          <button
            ref={headerRef}
            type="button"
            aria-expanded={!folded}
            aria-controls={panelId}
            onClick={onToggleFold}
            className={cn(
              "flex min-h-12 w-full items-center justify-between gap-3 px-4 py-2 text-left outline-none transition-colors duration-150 ease-(--ease-out) hover:bg-muted/40 focus-visible:ring-3 focus-visible:ring-ring/80 focus-visible:ring-inset active:bg-muted/60",
              folded ? "rounded-[20px]" : "rounded-t-[20px]",
            )}
          >
            {headerContent}
          </button>
        ) : (
          <span className="flex min-h-12 items-center justify-between gap-3 px-4 py-2">
            {headerContent}
          </span>
        )}
      </h2>
      <div
        id={panelId}
        ref={panelRef}
        className={cn(
          "grid transition-[grid-template-rows] duration-240 ease-(--ease-in-out) motion-reduce:duration-0",
          folded ? "grid-rows-[0fr]" : "grid-rows-[1fr]",
        )}
      >
        <div className="min-h-0 overflow-hidden" inert={folded}>
          <ul>{children}</ul>
        </div>
      </div>
    </section>
  );
}
