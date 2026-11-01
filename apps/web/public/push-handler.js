// Chore reminders: shows the push messages the API sends (apps/api/src/lib/push.ts) and opens the
// app when one is tapped. Loaded into the service worker that vite-plugin-pwa generates.

self.addEventListener("push", (event) => {
  let message = {};
  try {
    message = event.data ? event.data.json() : {};
  } catch {
    // Not JSON: show the generic title
  }
  event.waitUntil(
    self.registration.showNotification(message.title || "taskhold", {
      body: message.body,
      icon: "/icon-192.png",
      badge: "/badge.png",
      // A newer summary replaces the last one instead of piling up
      tag: message.tag,
      data: { url: message.url || "/" },
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  // Only ever a page of this app
  const url = new URL(event.notification.data?.url || "/", self.location.origin);
  if (url.origin !== self.location.origin) return;

  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      const open = windows[0];
      if (!open) return self.clients.openWindow(url.href);
      await open.focus();
      // Navigating only works for pages this service worker controls
      return open.navigate(url.href).catch(() => {});
    })(),
  );
});
