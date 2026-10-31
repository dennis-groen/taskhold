import { XIcon } from "@phosphor-icons/react";
import { useId } from "react";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";

import type { ShoppingItem } from "../shopping.api.ts";
import { firstName } from "../shopping-items.ts";

export function ShoppingItemRow({
  item,
  viewerId,
  onToggle,
  onRemove,
}: {
  item: ShoppingItem;
  viewerId: string;
  onToggle: (checked: boolean) => void;
  onRemove: () => void;
}) {
  const nameId = useId();
  const quantityId = useId();
  // Only mention other people; "added by you" on every row would be noise
  const byline = item.checked
    ? item.checkedBy &&
      item.checkedBy.id !== viewerId &&
      `Checked off by ${firstName(item.checkedBy.name)}`
    : item.addedBy && item.addedBy.id !== viewerId && `Added by ${firstName(item.addedBy.name)}`;

  return (
    <li className="flex min-h-14 items-center gap-1 pr-2">
      <label className="flex min-w-0 flex-1 cursor-pointer items-center gap-3 self-stretch py-2.5 pl-4">
        <Checkbox
          // Base UI's checkbox is a span, which the surrounding label doesn't name
          aria-labelledby={item.quantity ? `${nameId} ${quantityId}` : nameId}
          checked={item.checked}
          onCheckedChange={(checked) => onToggle(checked)}
          className="size-5"
        />
        <span className="min-w-0 flex-1">
          <span
            id={nameId}
            className={cn(
              "block text-base break-words",
              item.checked && "text-muted-foreground line-through",
            )}
          >
            {item.name}
          </span>
          {byline && <span className="block text-sm text-muted-foreground">{byline}</span>}
        </span>
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
