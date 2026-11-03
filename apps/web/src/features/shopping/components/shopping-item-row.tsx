import { XIcon } from "@phosphor-icons/react";
import { useId } from "react";

import { UserAvatar } from "@/components/user-avatar.tsx";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";

import type { ShoppingItem } from "../shopping.api.ts";

export function ShoppingItemRow({
  item,
  viewerId,
  settling = false,
  onToggle,
  onRemove,
}: {
  item: ShoppingItem;
  /** Just ticked or unticked here, and held in place for a moment (see useSettlingItems) */
  settling?: boolean;
  viewerId: string;
  onToggle: (checked: boolean) => void;
  onRemove: () => void;
}) {
  const nameId = useId();
  const quantityId = useId();
  // Only show other people; your own face on every row would be noise
  const person = item.checked ? item.checkedBy : item.addedBy;
  const other = person && person.id !== viewerId ? person : null;

  return (
    <li
      data-settling={settling ? (item.checked ? "checked" : "open") : undefined}
      className="flex min-h-13 items-center overflow-hidden pr-1"
    >
      <label className="flex min-w-0 flex-1 cursor-pointer items-center gap-3 self-stretch py-3 pl-4">
        <Checkbox
          // Base UI's checkbox is a span, which the surrounding label doesn't name
          aria-labelledby={item.quantity ? `${nameId} ${quantityId}` : nameId}
          checked={item.checked}
          onCheckedChange={(checked) => onToggle(checked)}
          className="size-6 rounded-full [&_svg]:size-4"
        />
        <span
          id={nameId}
          className={cn(
            "min-w-0 flex-1 text-base break-words",
            item.checked && "text-muted-foreground line-through",
          )}
        >
          {item.name}
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
          <span id={quantityId} className="shrink-0 text-sm text-muted-foreground tabular-nums">
            {item.quantity}
          </span>
        )}
      </label>
      <Button
        variant="ghost"
        size="icon-lg"
        aria-label={`Remove ${item.name}`}
        className="shrink-0 text-muted-foreground hover:text-destructive"
        onClick={onRemove}
      >
        <XIcon />
      </Button>
    </li>
  );
}
