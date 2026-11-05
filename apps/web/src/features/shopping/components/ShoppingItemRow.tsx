import { useId } from "react";

import { PencilSimpleIcon } from "@/components/icons.ts";
import { UserAvatar } from "@/components/UserAvatar.tsx";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";

import type { ShoppingItem } from "../shopping.api.ts";

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
  /** Opens the sheet to fix the name or quantity, or remove the item */
  onEdit: () => void;
}) {
  const nameId = useId();
  const quantityId = useId();
  // Only show other people; your own face on every row would be noise
  const person = item.checked ? item.checkedBy : item.addedBy;
  const other = person && person.id !== viewerId ? person : null;

  return (
    <li
      data-fresh={fresh || undefined}
      data-settling={settling ? (item.checked ? "checked" : "open") : undefined}
      className="group/row flex min-h-14 items-center overflow-hidden pr-1 transition-colors hover:bg-muted/40 has-[label:active]:bg-muted/70 data-fresh:animate-[row-fresh_1600ms_ease-out]"
    >
      <label className="flex min-w-0 flex-1 cursor-pointer items-center gap-3 self-stretch py-3 pl-4">
        <Checkbox
          // Base UI's checkbox is a span, which the surrounding label doesn't name
          aria-labelledby={item.quantity ? `${nameId} ${quantityId}` : nameId}
          checked={item.checked}
          onCheckedChange={(checked) => onToggle(checked)}
          variant="tick"
        />
        <span id={nameId} className="min-w-0 flex-1 text-base break-words">
          <span className="tick-label" data-done={item.checked || undefined}>
            {item.name}
          </span>
        </span>
        {other && (
          <span
            title={`${item.checked ? "Checked off" : "Added"} by ${other.name}`}
            className="shrink-0"
          >
            <UserAvatar name={other.name} image={null} size="sm" />
            <span className="sr-only">
              {item.checked ? "Checked off" : "Added"} by {other.name}
            </span>
          </span>
        )}
        {item.quantity && (
          <span
            id={quantityId}
            className="shrink-0 rounded-md bg-muted px-1.5 py-0.5 text-[0.8125rem] font-medium text-muted-foreground tabular-nums"
          >
            {item.quantity}
          </span>
        )}
      </label>
      <Button
        variant="ghost"
        size="icon-lg"
        aria-label={`Edit ${item.name}`}
        aria-haspopup="dialog"
        // Quieter than the item: a column of pencils shouldn't out-shout what's on the list
        className="shrink-0 text-muted-foreground/75 active:bg-muted active:text-foreground"
        onClick={onEdit}
      >
        <PencilSimpleIcon className="size-[1.125rem]" />
      </Button>
    </li>
  );
}
