import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

/** A card of rows, divided by hairlines: the building block of every household screen */
export function Group({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div
      className={cn(
        "divide-y divide-border/80 overflow-hidden rounded-xl bg-card text-card-foreground shadow-card",
        className,
      )}
    >
      {children}
    </div>
  );
}

/** The heading above a group */
export function GroupHeading({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <h2
      className={cn(
        "flex items-center gap-1.5 px-1 pt-7 pb-2.5 text-[0.9375rem] leading-5 font-semibold tracking-[-0.005em] text-foreground/85",
        className,
      )}
    >
      {children}
    </h2>
  );
}
