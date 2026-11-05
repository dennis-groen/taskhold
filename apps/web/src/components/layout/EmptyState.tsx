import type { ReactNode } from "react";

import type { Icon } from "@/components/icons.ts";
import { cn } from "cn";

/** What a list says when there's nothing in it: an icon in a soft circle over a line of text */
export function EmptyState({
  icon: IconComponent,
  children,
  className,
}: {
  icon: Icon;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center gap-3 px-6 py-10 text-center animate-in fade-in duration-300",
        className,
      )}
    >
      <span className="flex size-12 items-center justify-center rounded-full bg-primary-soft text-primary-soft-foreground">
        <IconComponent className="size-6" weight="duotone" aria-hidden />
      </span>
      <p className="max-w-[28ch] text-[0.9375rem] leading-6 text-pretty text-muted-foreground">
        {children}
      </p>
    </div>
  );
}
