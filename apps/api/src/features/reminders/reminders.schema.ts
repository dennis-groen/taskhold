import { z } from "zod";

// Push services of the browsers that support Web Push. Only these get requests from the server,
// so a made-up endpoint can't point it at another host.
const PUSH_HOSTS = ["fcm.googleapis.com", "android.googleapis.com"];
const PUSH_HOST_SUFFIXES = [".push.services.mozilla.com", ".notify.windows.com", ".push.apple.com"];

function isPushService(endpoint: string): boolean {
  const url = URL.parse(endpoint);
  if (url?.protocol !== "https:" || url.port !== "") return false;
  return (
    PUSH_HOSTS.includes(url.hostname) ||
    PUSH_HOST_SUFFIXES.some((suffix) => url.hostname.endsWith(suffix))
  );
}

function isTimeZone(value: string): boolean {
  try {
    Temporal.Now.zonedDateTimeISO(value);
    return true;
  } catch {
    return false;
  }
}

const endpoint = z
  .string()
  .max(1024)
  .refine(isPushService, "This isn't a push service we can send to.");

// base64url, as PushSubscription.toJSON() gives them
const key = (max: number) =>
  z
    .string()
    .max(max)
    .regex(/^[\w-]+=*$/, "Not a valid key.");

export const subscribeBody = z.object({
  subscription: z.object({
    endpoint,
    keys: z.object({ p256dh: key(200), auth: key(64) }),
  }),
  // The device's IANA time zone, e.g. "Europe/Amsterdam"
  timeZone: z.string().max(64).refine(isTimeZone, "Unknown time zone."),
});

export const unsubscribeBody = z.object({ endpoint: z.string().max(1024) });

export const settingsBody = z.object({
  // A time of day, "HH:MM"
  remindAt: z
    .string()
    .regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Use a time like 08:00.")
    .transform((value) => Temporal.PlainTime.from(value)),
});

export type SubscribeInput = z.infer<typeof subscribeBody>;
