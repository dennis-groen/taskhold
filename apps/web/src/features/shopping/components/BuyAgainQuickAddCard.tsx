import { CheckIcon, PlusIcon } from "@/components/icons.ts";
import { cn } from "cn";

import { categorize } from "../categories.ts";
import type { ShoppingItem } from "../shopping.api.ts";
import { EnterKeyHint } from "./BuyAgainCatalogRow.tsx";

/**
 * "Add what I typed" as a card: for something never bought before, or when no past buy has that
 * exact name. Says what tapping it will do when the name is already on the list.
 */
export function BuyAgainQuickAddCard({
  name,
  quantity,
  existing,
  listName,
  enterTarget,
  onAdd,
}: {
  name: string;
  quantity: string | null;
  existing: ShoppingItem | undefined;
  listName: string;
  /** Enter in the filter would do this */
  enterTarget: boolean;
  onAdd: () => void;
}) {
  return (
    <div
      className={cn(
        "overflow-clip rounded-[20px] bg-card shadow-card transition-[background-color,box-shadow] duration-150",
        enterTarget && "bg-area-tint ring-1 ring-area/45 ring-inset",
      )}
    >
      <button
        type="button"
        onClick={onAdd}
        className="flex min-h-14 w-full items-center gap-3 px-4 py-3 text-left outline-none transition-colors duration-150 hover:bg-muted/50 focus-visible:ring-3 focus-visible:ring-ring/80 focus-visible:ring-inset active:bg-muted/70"
      >
        <span
          aria-hidden
          className="grid size-7 shrink-0 place-items-center rounded-full bg-primary text-primary-foreground"
        >
          {existing && !existing.checked ? (
            <CheckIcon weight="bold" className="size-4" />
          ) : (
            <PlusIcon weight="bold" className="size-4" />
          )}
        </span>
        <span className="min-w-0 flex-1">
          <span className="line-clamp-2 block text-[1.0625rem] font-medium break-words text-foreground">
            {existing
              ? existing.checked
                ? `Untick "${existing.name}"`
                : quantity && quantity !== existing.quantity
                  ? `Update "${existing.name}" to ${quantity}`
                  : `"${existing.name}" is already on ${listName}`
              : `Add ${quantity ? `${quantity} ` : ""}"${name}" to ${listName}`}
          </span>
          <span className="block truncate text-xs text-muted-foreground">
            {existing
              ? existing.checked
                ? "Ticked · tap to get again"
                : existing.quantity
                  ? `Waiting, ${existing.quantity}`
                  : "Already waiting on this list"
              : categorize(name)}
          </span>
        </span>
        {enterTarget && <EnterKeyHint />}
      </button>
    </div>
  );
}
