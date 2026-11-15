import type { ComponentProps } from "react";

import { cn } from "cn";

import { DrawerContent, DrawerHeader } from "@/components/ui/drawer";

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
