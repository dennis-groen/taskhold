import { CaretDownIcon } from "@/components/icons.ts";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "cn";

/** "Adds to Groceries ▾": which list a tap on a chip adds to */
export function ListPicker({
  lists,
  value,
  onChange,
  className,
}: {
  lists: { id: string; name: string }[];
  value: string;
  onChange: (listId: string) => void;
  className?: string;
}) {
  const current = lists.find((list) => list.id === value);
  if (lists.length < 2)
    return (
      <span className={cn("text-[0.8125rem] text-muted-foreground", className)}>
        Adds to <b className="font-[750] text-foreground">{current?.name}</b>
      </span>
    );

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className={cn(
          "-my-2 flex min-h-11 min-w-0 items-center gap-1 rounded-xl px-2 text-[0.8125rem] text-muted-foreground outline-none transition-[background-color,scale] duration-150 ease-(--ease-out) hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/80 active:scale-[0.97] data-popup-open:bg-muted motion-reduce:active:scale-100",
          className,
        )}
      >
        Adds to <b className="truncate font-[750] text-foreground">{current?.name}</b>
        <CaretDownIcon aria-hidden weight="bold" className="size-3.5 shrink-0" />
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        sideOffset={4}
        className="w-auto min-w-48 rounded-[18px] bg-popover p-1.5 shadow-[0_18px_40px_-16px_rgb(0_0_0/0.35)] ring-1 ring-border transition-[opacity,scale] duration-150 ease-(--ease-out) data-ending-style:scale-95 data-ending-style:opacity-0 data-starting-style:scale-95 data-starting-style:opacity-0 motion-reduce:transition-none"
      >
        <DropdownMenuRadioGroup value={value} onValueChange={(next: string) => onChange(next)}>
          {lists.map((list) => (
            <DropdownMenuRadioItem
              key={list.id}
              value={list.id}
              className="min-h-11 rounded-xl px-3 text-[0.9375rem] font-[550]"
            >
              {list.name}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
