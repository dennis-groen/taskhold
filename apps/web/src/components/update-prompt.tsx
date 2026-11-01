import { useEffect } from "react";
import { toast } from "sonner";
import { useRegisterSW } from "virtual:pwa-register/react";

// An app left open for days still hears about new versions
const UPDATE_CHECK_INTERVAL = Temporal.Duration.from({ hours: 1 });

/**
 * Registers the service worker, and when a new version has been downloaded offers to switch to
 * it in a toast. Switching reloads the page, so it waits for the person rather than interrupting them.
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

  useEffect(() => {
    if (!needRefresh) return;
    toast("A new version of taskhold is ready.", {
      id: "app-update",
      // Stays until the person picks: reloading interrupts whatever they're doing
      duration: Number.POSITIVE_INFINITY,
      action: { label: "Reload", onClick: () => reload(updateServiceWorker) },
      cancel: { label: "Later", onClick: () => setNeedRefresh(false) },
    });
  }, [needRefresh, setNeedRefresh, updateServiceWorker]);

  return null;
}

function reload(updateServiceWorker: (reloadPage?: boolean) => Promise<void>) {
  // The plugin reloads by itself only if this tab was opened with a service worker already in
  // charge; on someone's first visit it wasn't, so reload once the new version takes over
  navigator.serviceWorker.addEventListener("controllerchange", () => window.location.reload(), {
    once: true,
  });
  void updateServiceWorker(true);
}
