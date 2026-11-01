import { ArrowClockwiseIcon } from "@phosphor-icons/react";
import { useRegisterSW } from "virtual:pwa-register/react";

import { Button } from "@/components/ui/button";

// An app left open for days still hears about new versions
const UPDATE_CHECK_INTERVAL = Temporal.Duration.from({ hours: 1 });

/**
 * Registers the service worker, and when a new version has been downloaded offers to switch to
 * it. Switching reloads the page, so it waits for the person rather than interrupting them.
 */
export function UpdatePrompt() {
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisteredSW(_url, registration) {
      if (!registration) return;
      setInterval(
        () => void registration.update().catch(() => {}),
        UPDATE_CHECK_INTERVAL.total("milliseconds"),
      );
    },
  });

  if (!needRefresh) return null;

  function reload() {
    // The plugin reloads by itself only if this tab was opened with a service worker already in
    // charge; on someone's first visit it wasn't, so reload once the new version takes over
    navigator.serviceWorker.addEventListener("controllerchange", () => window.location.reload(), {
      once: true,
    });
    void updateServiceWorker(true);
  }

  return (
    <div className="pointer-events-none fixed inset-x-0 top-[calc(0.75rem+env(safe-area-inset-top))] z-50 flex justify-center px-4">
      <output className="pointer-events-auto flex items-center gap-3 rounded-xl bg-popover py-2 pr-2 pl-4 text-sm text-popover-foreground shadow-lg ring-1 ring-foreground/10">
        A new version of taskhold is ready.
        <Button size="sm" onClick={reload}>
          <ArrowClockwiseIcon />
          Reload
        </Button>
        <Button size="sm" variant="ghost" onClick={() => setNeedRefresh(false)}>
          Later
        </Button>
      </output>
    </div>
  );
}
