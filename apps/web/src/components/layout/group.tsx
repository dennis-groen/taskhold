import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

/** A card of rows, divided by hairlines: the building block of every household screen */
export function Group({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div
      className={cn(
        "divide-y overflow-hidden rounded-xl bg-card text-card-foreground ring-1 ring-foreground/10",
        className,
      )}
    >
      {children}
    </div>
  );
}

/** Small label above a group */
export function GroupHeading({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <h2 className={cn("px-1 pt-6 pb-2 text-sm font-medium text-muted-foreground", className)}>
      {children}
    </h2>
  );
}
