import { onlineManager, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState, useSyncExternalStore } from "react";

import {
  ArrowClockwiseIcon,
  CaretDownIcon,
  CheckIcon,
  CloudSlashIcon,
} from "@/components/icons.ts";
import { SHEET_BODY, SheetContent, SheetEyebrow } from "@/components/layout/Sheet.tsx";
import { Button } from "@/components/ui/button";
import { Drawer, DrawerDescription, DrawerTitle } from "@/components/ui/drawer";
import { useWaitingChanges } from "@/lib/offline-changes.ts";
import { cn } from "cn";

// When the connection went, for "Offline since 9:31". Kept outside React so it survives pages.
let offlineSince: number | null = null;
const offlineListeners = new Set<() => void>();

function recordOfflineSince(online: boolean) {
  const next = online ? null : (offlineSince ?? Temporal.Now.instant().epochMilliseconds);
  if (next === offlineSince) return;
  offlineSince = next;
  for (const listener of offlineListeners) listener();
}

onlineManager.subscribe(recordOfflineSince);

/**
 * A pill at the top while the device is offline, so a tick in a basement supermarket doesn't
 * look saved when it's only waiting. It says how many changes are waiting and opens a sheet that
 * lists them. They're sent on their own once the connection is back (TanStack Query pauses them).
 */
export function ConnectionStatus() {
  const online = useSyncExternalStore(
    (onChange) => onlineManager.subscribe(onChange),
    () => onlineManager.isOnline(),
  );
  const since = useSyncExternalStore(
    (onChange) => {
      offlineListeners.add(onChange);
      return () => offlineListeners.delete(onChange);
    },
    () => offlineSince,
  );
  useEffect(() => {
    recordOfflineSince(online);
  }, [online]);
  const waiting = useWaitingChanges();
  const [open, setOpen] = useState(false);
  const count = waiting.length;

  return (
    <>
      <div className="pointer-events-none fixed top-[calc(0.625rem+env(safe-area-inset-top))] right-16 z-40 flex justify-end lg:top-4 lg:right-6">
        {!online && (
          <button
            type="button"
            onClick={() => setOpen(true)}
            aria-haspopup="dialog"
            aria-label={
              count === 0
                ? "Offline"
                : `Offline, ${count === 1 ? "1 change" : `${count} changes`} waiting to sync`
            }
            className="pointer-events-auto inline-flex min-h-10 items-center gap-1.5 rounded-full bg-foreground px-3 text-[0.8125rem] font-[650] text-background shadow-raised outline-none transition-[opacity,translate,scale] duration-200 ease-(--ease-out) focus-visible:ring-3 focus-visible:ring-ring/80 active:scale-[0.96] starting:-translate-y-2 starting:opacity-0 motion-reduce:transition-none"
          >
            <CloudSlashIcon className="size-4" weight="bold" aria-hidden />
            <span aria-hidden className="tabular-nums">
              {count === 0 ? "Offline" : count}
            </span>
            <span aria-hidden className="hidden lg:inline">
              {count > 0 && "to sync"}
            </span>
            <CaretDownIcon className="size-3.5" weight="bold" aria-hidden />
          </button>
        )}
      </div>

      <Drawer open={open} onOpenChange={setOpen}>
        <SheetContent>
          <SheetEyebrow icon={CloudSlashIcon}>
            {online ? "Back online" : `Offline${since ? ` since ${clock(since)}` : ""}`}
          </SheetEyebrow>
          <div className={cn(SHEET_BODY, "pt-1")}>
            <DrawerTitle className="text-[1.75rem] leading-[1.1] font-[850] tracking-[-0.02em] [font-stretch:118%]">
              {count === 0
                ? "Nothing waiting"
                : `${count === 1 ? "1 change" : `${count} changes`} waiting`}
            </DrawerTitle>
            <DrawerDescription className="mt-2 text-[0.9375rem] text-pretty text-muted-foreground">
              {count === 0
                ? "Everything you've done is saved. Changes you make offline wait here and sync on their own."
                : `${count === 1 ? "It's" : "They're"} saved on this phone and ${count === 1 ? "syncs" : "sync"} on ${count === 1 ? "its" : "their"} own when you're back online. You don't need to do anything.`}
            </DrawerDescription>
            {count > 0 && (
              <ul className="mt-4 max-h-[40dvh] divide-y divide-border overflow-y-auto">
                {waiting.map((change) => (
                  <li key={change.id} className="flex min-h-14 items-center gap-3 py-2">
                    <span
                      aria-hidden
                      className="grid size-8 shrink-0 place-items-center rounded-full bg-muted"
                    >
                      <CheckIcon weight="bold" className="size-4" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <b className="block truncate font-[650]">{change.what}</b>
                      <span className="block text-[0.8125rem] text-muted-foreground">
                        {change.area} · {clock(change.at)}
                      </span>
                    </span>
                    <span className="text-[0.8125rem] font-[650] text-muted-foreground">
                      Waiting
                    </span>
                  </li>
                ))}
              </ul>
            )}
            <TryNow />
          </div>
        </SheetContent>
      </Drawer>
    </>
  );
}

/** Sends what's waiting now instead of on the next retry, if the connection allows */
function TryNow() {
  const queryClient = useQueryClient();
  return (
    <Button
      variant="secondary"
      size="xl"
      className="mt-4 w-full rounded-2xl"
      onClick={() => void queryClient.resumePausedMutations()}
    >
      <ArrowClockwiseIcon />
      Try now
    </Button>
  );
}

/** "9:31" */
function clock(epochMs: number): string {
  return Temporal.Instant.fromEpochMilliseconds(epochMs)
    .toZonedDateTimeISO(Temporal.Now.timeZoneId())
    .toLocaleString("en-GB", { hour: "2-digit", minute: "2-digit" });
}
