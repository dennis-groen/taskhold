import { useId } from "react";

import { PencilSimpleIcon } from "@/components/icons.ts";
import { Checkbox } from "@/components/ui/checkbox";
import { firstName } from "@/lib/shared-with.ts";
import { cn } from "cn";

import type { ShoppingItem } from "../shopping.api.ts";

/**
 * One item: tap anywhere on it to tick it off. The quantity on the right is its own button and
 * opens the sheet to change the quantity, fix the name or remove the item. Without a quantity it
 * reads 1, as that's what no quantity means. Items a housemate added say so under the name.
 */
export function ShoppingItemRow({
  item,
  viewerId,
  settling = false,
  fresh = false,
  onToggle,
  onEdit,
}: {
  item: ShoppingItem;
  /** Just ticked or unticked here, and held in place for a moment (see useSettlingItems) */
  settling?: boolean;
  /** Just added here: it lights up once, so you can see where sorting put it */
  fresh?: boolean;
  viewerId: string;
  onToggle: (checked: boolean) => void;
  /** Opens the sheet to change the quantity, fix the name, or remove the item */
  onEdit: () => void;
}) {
  const nameId = useId();
  const byId = useId();
  // Only other people; "Added by you" on half the list would be noise
  const person = item.checked ? item.checkedBy : item.addedBy;
  const other = person && person.id !== viewerId ? person : null;
  const byline = other && `${item.checked ? "Checked off" : "Added"} by ${firstName(other.name)}`;

  return (
    <li
      data-fresh={fresh || undefined}
      data-settling={settling ? (item.checked ? "checked" : "open") : undefined}
      className="group/row flex min-h-14 items-center overflow-hidden pr-2 transition-colors hover:bg-muted/40 has-[label:active]:bg-muted/70 data-fresh:animate-[row-fresh_1600ms_ease-out]"
    >
      <label className="flex min-w-0 flex-1 cursor-pointer items-center gap-3 self-stretch py-3 pl-4">
        <Checkbox
          // Base UI's checkbox is a span, which the surrounding label doesn't name
          aria-labelledby={nameId}
          aria-describedby={byline ? byId : undefined}
          checked={item.checked}
          onCheckedChange={(checked) => onToggle(checked)}
          variant="tick"
        />
        <span className="min-w-0 flex-1">
          <span id={nameId} className="block text-base break-words">
            <span className="tick-label" data-done={item.checked || undefined}>
              {item.name}
            </span>
          </span>
          {byline && (
            <span id={byId} className="mt-0.5 block text-[0.8125rem] text-muted-foreground">
              {byline}
            </span>
          )}
        </span>
      </label>
      <button
        type="button"
        onClick={onEdit}
        aria-haspopup="dialog"
        aria-label={`Edit ${item.name}${item.quantity ? `, quantity ${item.quantity}` : ""}`}
        className="group/edit relative flex h-11 shrink-0 items-center justify-end pl-2 outline-none after:absolute after:inset-y-0 after:-right-2 after:left-0"
      >
        <span
          className={cn(
            // Long quantities ("2 large bags") wrap inside the button rather than crowd the name
            "flex min-h-9 max-w-36 items-center gap-1.5 rounded-lg py-1 text-[0.9375rem] leading-tight font-medium tabular-nums transition-[background-color,color,scale] duration-150 group-active/edit:scale-95 group-focus-visible/edit:ring-3 group-focus-visible/edit:ring-ring/80 motion-reduce:group-active/edit:scale-100",
            // With a quantity it's a soft filled button; without, just the pencil in the same place
            // In the cart the fill goes, so ticked rows recede with their struck-through names
            item.quantity
              ? cn(
                  "pr-2 pl-3 group-hover/edit:bg-muted group-active/edit:bg-[color-mix(in_oklch,var(--muted),var(--foreground)_8%)]",
                  !item.checked && "bg-[color-mix(in_oklch,var(--muted)_70%,var(--card))]",
                )
              : "px-2 group-hover/edit:bg-muted group-active/edit:bg-muted",
            item.checked ? "text-muted-foreground" : "text-foreground",
          )}
        >
          {item.quantity && (
            <span className="min-w-0 text-right break-words">
              <Quantity quantity={item.quantity} />
            </span>
          )}
          <PencilSimpleIcon
            aria-hidden
            className="size-[1.125rem] shrink-0 text-muted-foreground/80"
          />
        </span>
      </button>
    </li>
  );
}

/** A bare count reads as "×6", with a quieter ×; anything else as typed */
function Quantity({ quantity }: { quantity: string }) {
  if (!/^\d+$/.test(quantity)) return quantity;
  return (
    <>
      <span aria-hidden className="text-[0.8125rem] font-medium text-muted-foreground">
        ×
      </span>
      {quantity}
    </>
  );
}
