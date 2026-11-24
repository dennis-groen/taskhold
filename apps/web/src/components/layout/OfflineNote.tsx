import type { ReactNode } from "react";

import { CloudSlashIcon } from "@/components/icons.ts";
import { cn } from "cn";

/** A quiet box saying what waits for a connection */
export function OfflineNote({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div
      className={cn(
        "flex items-start gap-3 rounded-2xl bg-muted px-4 py-3.5 text-muted-foreground",
        className,
      )}
    >
      <CloudSlashIcon className="mt-0.5 size-5 shrink-0" weight="duotone" aria-hidden />
      <p className="text-pretty">{children}</p>
    </div>
  );
}
