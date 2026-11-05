import { useRouter } from "@tanstack/react-router";
import { useEffect } from "react";

import { ArrowClockwiseIcon, CloudSlashIcon, WarningCircleIcon } from "@/components/icons.ts";
import { Button } from "@/components/ui/button";
import { Wordmark } from "@/components/Wordmark.tsx";

const AUTO_RETRY = Temporal.Duration.from({ seconds: 10 });

/**
 * Shown when a page can't load. `unreachable` means the API couldn't be reached at all. Most often the installed app was opened without a connection,
 * so that case says so, and keeps trying again by itself.
 */
export function RootError({ unreachable }: { unreachable: boolean }) {
  const router = useRouter();

  // Tries again by itself: when the device is back online, when the app is opened again, and
  // every so often while it's on screen
  useEffect(() => {
    const retry = () => {
      if (unreachable && document.visibilityState === "visible") void router.invalidate();
    };
    const timer = setInterval(retry, AUTO_RETRY.total("milliseconds"));
    window.addEventListener("online", retry);
    document.addEventListener("visibilitychange", retry);
    return () => {
      clearInterval(timer);
      window.removeEventListener("online", retry);
      document.removeEventListener("visibilitychange", retry);
    };
  }, [router, unreachable]);

  const Icon = unreachable ? CloudSlashIcon : WarningCircleIcon;
  return (
    <div className="flex min-h-dvh flex-col bg-canvas px-4">
      <header className="mx-auto w-full max-w-sm pt-[calc(2rem+env(safe-area-inset-top))]">
        <Wordmark />
      </header>
      <main className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center py-12">
        <span className="flex size-12 items-center justify-center rounded-full bg-muted text-muted-foreground">
          <Icon className="size-6" weight="duotone" />
        </span>
        <h1 className="mt-5 text-title">
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
