import type { ComponentProps } from "react";

import { PlusIcon } from "@/components/icons.ts";
import { cn } from "cn";

/**
 * The add field at the top of the dock: it looks like a field ("Add a chore", "Jot a to-do") and
 * opens the area's add sheet with the keyboard up. The + is in the area's colour. Pass it as a
 * trigger's `render` so the trigger's props land on the button.
 */
export function JotButton({
  label,
  className,
  ...props
}: ComponentProps<"button"> & {
  /** What tapping it adds, shown where a placeholder would be */
  label: string;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      aria-haspopup="dialog"
      className={cn(
        "group/jot flex h-[52px] w-full items-center gap-2 rounded-[22px] bg-dock-field pr-4 pl-1.5 text-left outline-none transition-[scale,background-color] duration-150 ease-(--ease-out) focus-visible:ring-3 focus-visible:ring-ring/80 active:scale-[0.985] motion-reduce:active:scale-100 lg:bg-muted",
        className,
      )}
      {...props}
    >
      <span className="grid size-10 shrink-0 place-items-center rounded-[14px] bg-primary text-primary-foreground transition-transform duration-150 ease-(--ease-out) group-active/jot:scale-[0.92] motion-reduce:group-active/jot:scale-100">
        <PlusIcon weight="bold" className="size-[22px]" />
      </span>
      <span className="min-w-0 flex-1 truncate text-[1.0625rem] text-muted-foreground">
        {label}
      </span>
    </button>
  );
}
