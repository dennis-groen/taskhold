import { Link, type LinkProps } from "@tanstack/react-router";

import { CaretLeftIcon } from "@/components/icons.ts";
import { cn } from "cn";

/**
 * Back to where this page came from. On a compact bar (`onSlab`) it's a pill in the slab's own
 * colours; on the canvas it's quiet text.
 */
export function BackLink({
  to,
  label = "Back",
  onSlab = false,
}: {
  to: LinkProps["to"];
  label?: string;
  onSlab?: boolean;
}) {
  return (
    <Link
      to={to}
      className={cn(
        "inline-flex h-11 shrink-0 items-center gap-0.5 rounded-full pr-3 pl-1.5 text-sm font-[650] outline-none transition-[background-color,color,scale] duration-150 ease-(--ease-out) active:scale-[0.96] motion-reduce:active:scale-100",
        onSlab
          ? "focus-visible:ring-3 focus-visible:ring-area-on/70 active:bg-area-on/15"
          : "-ml-2.5 mb-2 text-muted-foreground hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/80",
      )}
    >
      <CaretLeftIcon weight="bold" className="size-5" />
      {label}
    </Link>
  );
}
