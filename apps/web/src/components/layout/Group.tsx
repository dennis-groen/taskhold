import type { ReactNode } from "react";

import { cn } from "cn";

/** Rows on the canvas, divided by hairlines and running edge to edge on phones */
export function Group({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div
      className={cn(
        "-mx-4 divide-y divide-border px-1 sm:-mx-6 sm:px-2 lg:mx-0 lg:px-0",
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
        "flex items-center gap-1.5 px-1 pt-6 pb-1 text-sm leading-5 font-[750]",
        className,
      )}
    >
      {children}
    </h2>
  );
}
