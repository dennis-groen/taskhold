import { ArrowClockwiseIcon, CloudSlashIcon, WarningCircleIcon } from "@phosphor-icons/react";
import { useRouter } from "@tanstack/react-router";
import { useEffect } from "react";

import { Button } from "@/components/ui/button";

/**
 * Shown when a page can't load. `unreachable` means the API couldn't be reached at all. Most often the installed app was opened without a connection,
 * so that case says so, and tries again by itself when the device is back online.
 */
export function RootError({ unreachable }: { unreachable: boolean }) {
  const router = useRouter();

  useEffect(() => {
    const retry = () => {
      if (unreachable) void router.invalidate();
    };
    window.addEventListener("online", retry);
    return () => window.removeEventListener("online", retry);
  }, [router, unreachable]);

  const Icon = unreachable ? CloudSlashIcon : WarningCircleIcon;
  return (
    <div className="flex min-h-dvh flex-col bg-muted/50 px-4 dark:bg-background">
      <header className="mx-auto w-full max-w-sm pt-[calc(2rem+env(safe-area-inset-top))]">
        <span className="text-base font-semibold tracking-tight">taskhold</span>
      </header>
      <main className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center py-12">
        <Icon className="size-8 text-muted-foreground" />
        <h1 className="mt-4 text-2xl font-semibold tracking-tight">
          {unreachable ? "Can't reach taskhold" : "Something went wrong"}
        </h1>
        <p className="mt-2 text-pretty text-muted-foreground">
          {unreachable
            ? navigator.onLine
              ? "The server isn't answering. Try again in a moment."
              : "You're offline. Your lists will load again as soon as you're connected."
            : "This page couldn't load. Reloading usually fixes it."}
        </p>
        <Button
          size="lg"
          className="mt-6 self-start"
          onClick={() => (unreachable ? void router.invalidate() : window.location.reload())}
        >
          <ArrowClockwiseIcon />
          {unreachable ? "Try again" : "Reload"}
        </Button>
      </main>
    </div>
  );
}
