import { onlineManager, useIsMutating } from "@tanstack/react-query";
import { useSyncExternalStore } from "react";

import { CloudSlashIcon } from "@/components/icons.ts";

/**
 * A small pill at the top while the device is offline, so a tick in a basement supermarket
 * doesn't look saved when it's only waiting. Changes made meanwhile are held and sent once the
 * connection is back (TanStack Query pauses them), and the pill says how many are waiting.
 */
export function ConnectionStatus() {
  const online = useSyncExternalStore(
    (onChange) => onlineManager.subscribe(onChange),
    () => onlineManager.isOnline(),
  );
  const waiting = useIsMutating();

  return (
    <output className="pointer-events-none fixed inset-x-0 top-[calc(0.5rem+env(safe-area-inset-top))] z-40 flex justify-center px-4 lg:pl-24">
      {!online && (
        <span className="inline-flex items-center gap-2 rounded-full bg-foreground px-3.5 py-1.5 text-[0.8125rem] font-semibold text-background shadow-raised animate-in fade-in slide-in-from-top-2 duration-200">
          <CloudSlashIcon className="size-4" weight="bold" aria-hidden />
          {waiting === 0
            ? "Offline"
            : `Offline · ${waiting === 1 ? "1 change" : `${waiting} changes`} waiting`}
        </span>
      )}
    </output>
  );
}
