import { useId } from "react";

import { MemberMark } from "@/components/MemberMark.tsx";
import { Checkbox } from "@/components/ui/checkbox";
import { firstName } from "@/lib/shared-with.ts";
import { cn } from "cn";

import type { ShoppingItem } from "../shopping.api.ts";

/**
 * One item. The round tick on the right, under the thumb, ticks it off; tapping the name or the
 * amount opens the sheet to change either, or remove the item. A ticked item says who ticked it
 * just before the tick, with a dot in their colour.
 */
export function ShoppingItemRow({
  item,
  viewerId,
  settling = false,
  unsynced = false,
  onToggle,
  onEdit,
}: {
  item: ShoppingItem;
  /** Just ticked or unticked here, and held in place for a moment (see useSettlingItems) */
  settling?: boolean;
  viewerId: string;
  /** Its tick is saved on this phone and waiting to sync */
  unsynced?: boolean;
  onToggle: (checked: boolean) => void;
  /** Opens the sheet to change the amount, fix the name, or remove the item */
  onEdit: () => void;
}) {
  const nameId = useId();
  const byId = useId();
  // Who ticked it, said beside the tick; who added it only when it wasn't you
  const tickedBy =
    item.checked && item.checkedBy
      ? item.checkedBy.id === viewerId
        ? "You"
        : firstName(item.checkedBy.name)
      : null;
  const addedBy =
    !item.checked && item.addedBy && item.addedBy.id !== viewerId
      ? `Added by ${firstName(item.addedBy.name)}`
      : null;
  const byline = tickedBy
    ? `Ticked by ${tickedBy === "You" ? "you" : tickedBy}${unsynced ? ", not synced yet" : ""}`
    : addedBy;

  return (
    <li
      data-settling={settling ? (item.checked ? "checked" : "open") : undefined}
      // Inside a category card: pl-4 lines item text up with the header's icon chip; pr-[7px]
      // puts the 26px tick circle (9px inside its 44px target) 16px from the card's edge, flush
      // with the header count. In left-handed mode, text starts at 7 + 44 + 4 = 55px from left.
      className="relative flex min-h-12 items-center gap-1 pr-[7px] pl-4 ticks-left:flex-row-reverse ticks-left:pr-4 ticks-left:pl-[7px] before:absolute before:top-0 before:right-0 before:left-4 before:h-px before:bg-border first:before:hidden ticks-left:before:left-[55px]"
    >
      <button
        type="button"
        onClick={onEdit}
        aria-haspopup="dialog"
        aria-label={`Edit ${item.name}${item.quantity ? `, ${item.quantity}` : ""}`}
        className="flex min-w-0 flex-1 items-center gap-2.5 self-stretch rounded-lg py-2.5 text-left outline-none transition-opacity duration-150 focus-visible:ring-3 focus-visible:ring-ring/80 focus-visible:ring-inset active:opacity-60"
      >
        <span className="min-w-0 flex-1">
          <span id={nameId} className="block truncate text-[1.0625rem] font-medium">
            <span className="tick-label" data-done={item.checked || undefined}>
              {item.name}
            </span>
          </span>
          {addedBy && (
            <span className="mt-0.5 block text-[0.8125rem] font-semibold text-muted-foreground">
              {addedBy}
            </span>
          )}
        </span>
        {item.quantity && (
          <span
            className={cn(
              "max-w-32 shrink-0 truncate text-[0.9375rem] font-semibold tabular-nums",
              item.checked ? "text-muted-foreground/70" : "text-muted-foreground",
            )}
          >
            {item.quantity}
          </span>
        )}
      </button>
      {tickedBy && (
        <span
          aria-hidden
          className="shrink-0 pl-1 text-xs font-semibold text-muted-foreground transition-opacity duration-200 ease-(--ease-out) starting:opacity-0"
        >
          {tickedBy}
        </span>
      )}
      <span id={byId} className="sr-only">
        {byline}
      </span>
      <span className="relative grid size-11 shrink-0 place-items-center">
        <Checkbox
          // Base UI's checkbox is a span, which the surrounding label doesn't name
          aria-labelledby={nameId}
          aria-describedby={byline ? byId : undefined}
          checked={item.checked}
          onCheckedChange={(checked) => onToggle(checked)}
          variant="tick"
        />
        {item.checked && item.checkedBy && (
          <MemberMark name={item.checkedBy.name} waiting={unsynced} />
        )}
      </span>
    </li>
  );
}
