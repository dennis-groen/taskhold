// This browser's Web Push subscription, which chore reminders use. Shared, so signing out can
// remove it: whoever signs in next on this device shouldn't get someone else's reminders.
import { api, parseResponse } from "./api-client.ts";

/** The service worker that receives pushes, or null when this browser can't get them */
export async function pushRegistration(): Promise<ServiceWorkerRegistration | null> {
  if (
    !("serviceWorker" in navigator) ||
    !("PushManager" in window) ||
    !("Notification" in window)
  ) {
    return null;
  }
  // Undefined in development, where there's no service worker
  return (await navigator.serviceWorker.getRegistration()) ?? null;
}

export async function currentPushSubscription(): Promise<PushSubscription | null> {
  const registration = await pushRegistration();
  return (await registration?.pushManager.getSubscription()) ?? null;
}

/** Stops reminders on this device. Never throws: signing out mustn't fail because of it. */
export async function forgetPushDevice(): Promise<void> {
  try {
    const subscription = await currentPushSubscription();
    if (!subscription) return;
    // Unsubscribing the browser first is what guarantees nothing more arrives here. If the server
    // still holds the device (this fails, or a sync was in flight), the push service refuses the
    // next message and the server forgets the device then.
    await subscription.unsubscribe();
    // Fails once the account is gone, which removed the device on the server already
    await parseResponse(
      api.reminders.subscription.$delete({ json: { endpoint: subscription.endpoint } }),
    ).catch(() => {});
  } catch {
    // Nothing more to do
  }
}
