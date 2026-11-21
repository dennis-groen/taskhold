import type { ComponentProps, ReactNode } from "react";

import { cn } from "cn";

import { XIcon, type Icon } from "@/components/icons.ts";
import { DrawerClose, DrawerContent, DrawerHeader } from "@/components/ui/drawer";

/** A bottom sheet as wide as a page at most, centred on wide screens */
export function SheetContent({ className, ...props }: ComponentProps<typeof DrawerContent>) {
  return <DrawerContent className={cn("mx-auto max-w-[640px]", className)} {...props} />;
}

/** A sheet's visible title area, lined up with its body */
export function SheetHeader({ className, ...props }: ComponentProps<typeof DrawerHeader>) {
  return <DrawerHeader className={cn("px-5 pt-5 text-left", className)} {...props} />;
}

/**
 * Classes for a sheet's body (a div or a form): side padding that lines up with the header, and
 * room at the bottom for the phone's home indicator. Add `overflow-y-auto` and the like next to it.
 */
export const SHEET_BODY = "px-5 pt-4 pb-[calc(1.25rem+env(safe-area-inset-bottom))]";

/**
 * The small line at the top of a sheet that says what it's about ("Groceries · Dairy & Eggs",
 * "Chore · shared"), with a ✕ to close it and room for a button or two before that.
 */
export function SheetEyebrow({
  icon: EyebrowIcon,
  children,
  actions,
}: {
  icon: Icon;
  children: ReactNode;
  /** Buttons before the ✕, e.g. a pencil to edit */
  actions?: ReactNode;
}) {
  return (
    <div className="flex items-center gap-1 pt-3 pr-3 pl-5">
      <p className="flex min-w-0 flex-1 items-center gap-1.5 text-[0.8125rem] font-[650] text-muted-foreground">
        <EyebrowIcon aria-hidden weight="bold" className="size-4 shrink-0 text-area-fg" />
        <span className="truncate">{children}</span>
      </p>
      {actions}
      <DrawerClose aria-label="Close" className={SHEET_ICON_BUTTON}>
        <XIcon weight="bold" className="size-5" />
      </DrawerClose>
    </div>
  );
}

/** A round grey button at the top of a sheet: ✕, or a pencil */
export const SHEET_ICON_BUTTON =
  "grid size-11 shrink-0 place-items-center rounded-full text-muted-foreground outline-none transition-[background-color,scale] duration-150 ease-(--ease-out) hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/80 active:scale-[0.92] motion-reduce:active:scale-100";
