import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";

import { forgetPushDevice, pushRegistration } from "@/lib/push-device.ts";

import { saveDevice, type ReminderStatus } from "./reminders.api.ts";
import { reminderKeys } from "./reminders.queries.ts";

/**
 * Whether this device gets reminders, or why it can't:
 * - "needs-install": iPhone and iPad only get notifications in the app added to the Home Screen
 * - "blocked": the person denied notifications for the site, which only the browser can undo
 * - "unsupported": no Web Push here (or no service worker, as in development)
 */
export type DeviceState = "loading" | "unsupported" | "needs-install" | "blocked" | "off" | "on";

export function useDeviceReminders(publicKey: string | null) {
  const queryClient = useQueryClient();
  const [state, setState] = useState<DeviceState>("loading");

  const saved = (status: ReminderStatus) => queryClient.setQueryData(reminderKeys.status(), status);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const next = await currentState(publicKey, saved).catch((): DeviceState => "unsupported");
      if (!cancelled) setState(next);
    })();
    return () => {
      cancelled = true;
    };
    // `saved` only writes to the query cache
    // oxlint-disable-next-line react-hooks/exhaustive-deps
  }, [publicKey]);

  async function turnOn() {
    const registration = await pushRegistration();
    if (!registration || !publicKey) return setState("unsupported");
    if ((await Notification.requestPermission()) !== "granted") {
      return setState(Notification.permission === "denied" ? "blocked" : "off");
    }
    const subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: base64UrlToBytes(publicKey),
    });
    saved(await saveDevice(subscription));
    setState("on");
  }

  async function turnOff() {
    await forgetPushDevice();
    setState("off");
  }

  return { state, turnOn, turnOff };
}

async function currentState(
  publicKey: string | null,
  saved: (status: ReminderStatus) => void,
): Promise<DeviceState> {
  if (isAppleMobile() && !isInstalled()) return "needs-install";
  const registration = await pushRegistration();
  if (!registration || !publicKey) return "unsupported";
  if (Notification.permission === "denied") return "blocked";

  let subscription = await registration.pushManager.getSubscription();
  // Made with keys the server no longer uses: pushes signed with the new ones would be refused
  if (subscription && !sameKey(subscription, publicKey)) {
    await subscription.unsubscribe();
    subscription = null;
  }
  if (!subscription) return "off";
  // Tell the server again: it may have forgotten the device, and the time zone may have changed
  saved(await saveDevice(subscription));
  return "on";
}

function sameKey(subscription: PushSubscription, publicKey: string): boolean {
  const current = subscription.options.applicationServerKey;
  if (!current) return false;
  const expected = base64UrlToBytes(publicKey);
  const actual = new Uint8Array(current);
  return actual.length === expected.length && actual.every((byte, i) => byte === expected[i]);
}

function base64UrlToBytes(value: string): Uint8Array<ArrayBuffer> {
  const base64 = value.replaceAll("-", "+").replaceAll("_", "/");
  const binary = atob(base64.padEnd(Math.ceil(base64.length / 4) * 4, "="));
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

function isAppleMobile(): boolean {
  // iPadOS reports itself as a Mac, but Macs have no touch screen
  return (
    /iPhone|iPad|iPod/.test(navigator.userAgent) ||
    (navigator.userAgent.includes("Macintosh") && navigator.maxTouchPoints > 1)
  );
}

function isInstalled(): boolean {
  return (
    matchMedia("(display-mode: standalone)").matches ||
    ("standalone" in navigator && navigator.standalone === true)
  );
}
