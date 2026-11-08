import { InfoIcon } from "@/components/icons.ts";
import { Button } from "@/components/ui/button";
import { cn } from "cn";

import type { Entry } from "../item-entry.ts";
import { stepQuantity } from "../item-quantity.ts";
import type { ShoppingItem } from "../shopping.api.ts";

/**
 * Said instead of adding an item the list already has: "Milk is already on the list", with a
 * button to change its quantity (to what was typed, or one more) and one to add it anyway.
 * The buttons don't take focus from the field, so the keyboard stays up for the next item.
 */
export function AlreadyOnList({
  item,
  entry,
  onSetQuantity,
  onAddAnyway,
  className,
}: {
  item: ShoppingItem;
  entry: Entry;
  onSetQuantity: (quantity: string) => void;
  onAddAnyway: () => void;
  className?: string;
}) {
  const nextQuantity = entry.quantity
    ? entry.quantity === item.quantity
      ? null
      : entry.quantity
    : stepQuantity(item.quantity ?? "", 1);

  return (
    <div
      className={cn(
        "flex flex-wrap items-center gap-x-3 gap-y-2 animate-in fade-in duration-200",
        className,
      )}
    >
      <span className="flex min-w-0 flex-1 basis-48 items-center gap-1.5 text-[0.8125rem] font-medium">
        <InfoIcon
          className="size-4 shrink-0 text-primary-soft-foreground"
          weight="bold"
          aria-hidden
        />
        <span className="min-w-0 break-words">
          {item.name} is already on the list
          {item.quantity && <span className="text-muted-foreground"> ({item.quantity})</span>}
        </span>
      </span>
      <span className="flex shrink-0 gap-2">
        {nextQuantity && (
          <Button
            type="button"
            variant="soft"
            size="sm"
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => onSetQuantity(nextQuantity)}
          >
            Make it {nextQuantity}
          </Button>
        )}
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onMouseDown={(event) => event.preventDefault()}
          onClick={onAddAnyway}
        >
          Add anyway
        </Button>
      </span>
    </div>
  );
}
