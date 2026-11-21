import { DotsThreeIcon, type Icon } from "@/components/icons.ts";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "cn";

export type MoreMenuItem = {
  label: string;
  icon: Icon;
  onSelect: () => void;
  /** Deletes or removes something: red, and below a line */
  danger?: boolean;
};

/**
 * The ⋯ button and its menu: the actions on a row or a page that don't deserve a button of their
 * own. It grows out of the button it came from.
 */
export function MoreMenu({
  label,
  items,
  onSlab = false,
  className,
}: {
  /** Names the button for screen readers: "More for Groceries" */
  label: string;
  items: MoreMenuItem[];
  /** Sits on an area's colour, so it takes the slab's text colour */
  onSlab?: boolean;
  className?: string;
}) {
  const safe = items.filter((item) => !item.danger);
  const danger = items.filter((item) => item.danger);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label={label}
        className={cn(
          "grid size-11 shrink-0 place-items-center rounded-[14px] outline-none transition-[background-color,scale] duration-150 ease-(--ease-out) focus-visible:ring-3 focus-visible:ring-ring/80 active:scale-[0.94] motion-reduce:active:scale-100",
          onSlab
            ? "text-area-on hover:bg-area-on/12 data-popup-open:bg-area-on/15"
            : "text-muted-foreground hover:bg-muted data-popup-open:bg-muted data-popup-open:text-foreground",
          className,
        )}
      >
        <DotsThreeIcon weight="bold" className="size-6" />
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        sideOffset={6}
        className="w-auto min-w-56 rounded-[18px] bg-popover p-1.5 shadow-[0_18px_40px_-16px_rgb(0_0_0/0.35)] ring-1 ring-border transition-[opacity,scale] duration-150 ease-(--ease-out) before:hidden data-ending-style:scale-95 data-ending-style:opacity-0 data-starting-style:scale-95 data-starting-style:opacity-0 motion-reduce:transition-none"
      >
        {safe.map((item) => (
          <Item key={item.label} {...item} />
        ))}
        {safe.length > 0 && danger.length > 0 && <DropdownMenuSeparator className="mx-2 my-1" />}
        {danger.map((item) => (
          <Item key={item.label} {...item} />
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function Item({ label, icon: ItemIcon, onSelect, danger }: MoreMenuItem) {
  return (
    <DropdownMenuItem
      onClick={onSelect}
      className={cn(
        "min-h-11 gap-3 rounded-xl px-3 text-[0.9375rem] font-[550]",
        danger && "text-destructive",
      )}
    >
      <ItemIcon aria-hidden className="size-5" />
      {label}
    </DropdownMenuItem>
  );
}
