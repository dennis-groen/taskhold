import { useState } from "react";

import { CheckIcon, MinusCircleIcon, MinusIcon, PlusIcon } from "@/components/icons.ts";
import { Button } from "@/components/ui/button";
import { firstName } from "@/lib/shared-with.ts";
import { cn } from "cn";

import { lastBoughtCue, type BuyAgainCatalogItem } from "../buy-again.ts";
import { itemKey } from "../item-entry.ts";
import { stepQuantity } from "../item-quantity.ts";
import type { ShoppingItem } from "../shopping.api.ts";

/** A small Return key on whatever Enter in the filter would act on */
export function EnterKeyHint() {
  return (
    <kbd
      aria-hidden
      className="grid h-5 shrink-0 place-items-center rounded-md bg-area/15 px-1.5 font-sans text-xs font-[750] text-area-fg ring-1 ring-area/30 ring-inset"
    >
      ↵
    </kbd>
  );
}

/**
 * One past buy row inside the Buy again sheet: taps to add/untick/undo, shows inline quantity
 * steppers once on the list, or turns into a hide-with-Undo row in Edit mode.
 */
export function BuyAgainCatalogRow({
  entry,
  now,
  viewerId,
  listItem,
  addedHere,
  untickedHere,
  hinted,
  fresh,
  enterTarget,
  editing,
  pendingHide,
  collapsing,
  typedQuantity,
  onToggle,
  onStep,
  onHide,
  onUndoHide,
}: {
  entry: BuyAgainCatalogItem;
  now: Temporal.Instant;
  viewerId: string;
  listItem: ShoppingItem | undefined;
  addedHere: boolean;
  untickedHere: boolean;
  hinted: boolean;
  /** Just changed from the filter's Enter: light up once */
  fresh: boolean;
  /** What Enter in the filter would act on right now */
  enterTarget: boolean;
  editing: boolean;
  pendingHide: boolean;
  collapsing: boolean;
  typedQuantity: string | null;
  onToggle: () => void;
  onStep: (item: ShoppingItem, delta: 1 | -1) => void;
  onHide: () => void;
  onUndoHide: () => void;
}) {
  const onList = entry.onList && listItem !== undefined;
  // Paired rows lead with "Goes with your list", and rows on the list make room for the stepper,
  // so both drop the cycle to stay on one line
  const cue = lastBoughtCue(
    entry.lastBoughtAt,
    onList || entry.paired ? null : entry.usualDays,
    now,
  );
  const fewer = onList ? stepQuantity(listItem.quantity ?? "", -1) : null;
  const more = onList ? stepQuantity(listItem.quantity ?? "", 1) : null;
  const currentQty = listItem?.quantity ?? "1";
  const displayQty = typedQuantity ?? entry.quantity;
  const housemateAdded =
    onList && !addedHere && !untickedHere && listItem.addedBy && listItem.addedBy.id !== viewerId
      ? `Added by ${firstName(listItem.addedBy.name)}`
      : null;
  // Pop the check and stepper in only when this row goes onto the list while you watch. A row
  // that mounts already on the list (opening, filtering, switching lists) appears as it is.
  const [shownOnList, setShownOnList] = useState(onList);
  const [justAdded, setJustAdded] = useState(false);
  if (onList !== shownOnList) {
    setShownOnList(onList);
    setJustAdded(onList);
  }
  const animate = justAdded;

  return (
    <li
      data-row-key={itemKey(entry.name)}
      className={cn(
        // Reduced motion keeps the tint, just without the fade
        fresh &&
          "animate-[row-fresh_1.4s_var(--ease-out)] motion-reduce:animate-none motion-reduce:bg-primary-soft/60",
        enterTarget && "bg-area-tint ring-1 ring-area/45 ring-inset last:rounded-b-[20px]",
        "relative grid transition-[grid-template-rows,opacity] duration-200 ease-(--ease-out) before:absolute before:top-0 before:right-0 before:left-[3.5rem] before:h-px before:bg-border first:before:hidden motion-reduce:transition-none",
        collapsing
          ? "pointer-events-none grid-rows-[0fr] opacity-0"
          : "grid-rows-[1fr] opacity-100",
      )}
    >
      <div className="min-h-0 overflow-hidden" inert={collapsing}>
        {/* Stays the "hidden" strip while it folds away, so it never flashes back to the item */}
        {pendingHide || collapsing ? (
          <div className="flex min-h-14 items-center justify-between gap-3 bg-muted/50 pr-2 pl-4 transition-opacity duration-180 ease-(--ease-out) starting:opacity-0 motion-reduce:transition-none">
            <span className="min-w-0 truncate text-sm text-muted-foreground">
              {entry.name} hidden
            </span>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={onUndoHide}
              className="h-11 shrink-0 rounded-xl px-3.5 text-sm font-[750] text-area-fg"
            >
              Undo
            </Button>
          </div>
        ) : (
          <div className="flex min-h-14 items-center gap-1 pr-3 transition-colors duration-100 has-[>button:first-child:active]:bg-muted/70">
            {editing ? (
              <div className="flex min-h-14 min-w-0 flex-1 items-center gap-3 py-2.5 pl-4">
                <button
                  type="button"
                  aria-label={`Hide ${entry.name} from Buy again`}
                  onClick={onHide}
                  className="relative grid size-7 shrink-0 place-items-center rounded-full text-destructive outline-none transition-[transform,opacity] duration-180 ease-(--ease-out) after:absolute after:-inset-2 focus-visible:ring-3 focus-visible:ring-destructive/40 active:scale-[0.9] starting:scale-90 starting:opacity-0 motion-reduce:transition-none motion-reduce:active:scale-100"
                >
                  <MinusCircleIcon aria-hidden weight="fill" className="size-6" />
                </button>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[1.0625rem] font-medium text-foreground">
                    {entry.name}
                  </span>
                  <span className="block truncate text-xs text-muted-foreground">{cue}</span>
                </span>
              </div>
            ) : (
              <button
                type="button"
                aria-pressed={onList}
                onClick={onToggle}
                className="flex min-h-14 min-w-0 flex-1 items-center gap-3 py-2.5 pl-4 text-left outline-none focus-visible:bg-muted/60 focus-visible:ring-2 focus-visible:ring-ring/80 focus-visible:ring-inset"
              >
                <span
                  aria-hidden
                  className={cn(
                    "grid size-7 shrink-0 place-items-center rounded-full transition-colors duration-150 ease-(--ease-out)",
                    onList || enterTarget
                      ? "bg-primary text-primary-foreground"
                      : "border border-border bg-card text-area-fg",
                  )}
                >
                  {onList ? (
                    <CheckIcon
                      weight="bold"
                      className={cn(
                        "size-4",
                        animate &&
                          "animate-[check-pop_220ms_var(--ease-out)] motion-reduce:animate-none",
                      )}
                    />
                  ) : (
                    <PlusIcon weight="bold" className="size-3.5" />
                  )}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex min-w-0 items-center gap-2">
                    <span className="truncate text-[1.0625rem] font-medium text-foreground">
                      {entry.name}
                    </span>
                    {enterTarget && <EnterKeyHint />}
                  </span>
                  <span
                    className={cn(
                      "block truncate text-xs transition-colors duration-200",
                      hinted ? "font-semibold text-area-fg" : "text-muted-foreground",
                    )}
                  >
                    {entry.checked ? (
                      "Ticked · tap to get again"
                    ) : untickedHere ? (
                      "Back on list"
                    ) : housemateAdded ? (
                      housemateAdded
                    ) : onList && !addedHere ? (
                      "Already on list"
                    ) : entry.paired && !onList ? (
                      <>
                        <span className="font-semibold text-area-fg">Goes with your list</span> ·{" "}
                        {cue}
                      </>
                    ) : (
                      cue
                    )}
                  </span>
                </span>
              </button>
            )}

            {!editing && onList ? (
              <div
                className={cn(
                  "flex shrink-0 items-center gap-1",
                  animate &&
                    "transition-[opacity,scale,filter] duration-180 ease-(--ease-out) starting:scale-96 starting:opacity-0 starting:blur-[2px] motion-reduce:transition-none motion-reduce:starting:scale-100 motion-reduce:starting:blur-none",
                )}
              >
                {more !== null ? (
                  <>
                    <button
                      type="button"
                      aria-label={`One fewer ${entry.name}`}
                      disabled={!fewer}
                      onClick={() => onStep(listItem, -1)}
                      className="relative grid size-9 place-items-center rounded-full bg-muted text-foreground outline-none transition-[background-color,scale,opacity] duration-150 ease-(--ease-out) after:absolute after:-inset-1 hover:bg-secondary focus-visible:ring-2 focus-visible:ring-ring/80 active:scale-[0.92] disabled:opacity-35 motion-reduce:active:scale-100"
                    >
                      <MinusIcon aria-hidden weight="bold" className="size-3.5" />
                    </button>
                    <span
                      aria-live="polite"
                      className="max-w-24 min-w-6 truncate px-1 text-center text-sm font-[750] text-foreground tabular-nums"
                    >
                      {currentQty}
                    </span>
                    <button
                      type="button"
                      aria-label={`One more ${entry.name}`}
                      onClick={() => onStep(listItem, 1)}
                      className="relative grid size-9 place-items-center rounded-full bg-muted text-foreground outline-none transition-[background-color,scale,opacity] duration-150 ease-(--ease-out) after:absolute after:-inset-1 hover:bg-secondary focus-visible:ring-2 focus-visible:ring-ring/80 active:scale-[0.92] motion-reduce:active:scale-100"
                    >
                      <PlusIcon aria-hidden weight="bold" className="size-3.5" />
                    </button>
                  </>
                ) : (
                  listItem.quantity && (
                    <span className="max-w-24 truncate rounded-full bg-primary-soft px-2.5 py-1 text-xs font-[700] text-primary-soft-foreground tabular-nums">
                      {listItem.quantity}
                    </span>
                  )
                )}
              </div>
            ) : !editing && displayQty ? (
              <span className="max-w-24 shrink-0 truncate rounded-full bg-muted px-2.5 py-0.5 text-xs font-semibold text-muted-foreground tabular-nums">
                {displayQty}
              </span>
            ) : null}
          </div>
        )}
      </div>
    </li>
  );
}
