import { z } from "zod";

// Push services of the browsers that support Web Push. Only these get requests from the server,
// so a made-up endpoint can't point it at another host.
const PUSH_HOSTS = ["fcm.googleapis.com", "android.googleapis.com"];
const PUSH_HOST_SUFFIXES = [".push.services.mozilla.com", ".notify.windows.com", ".push.apple.com"];

// Letters, digits and hyphens in dot-separated labels. web-push 3 re-parsed the endpoint with Node's
// legacy url.parse, which ends the host at characters URL accepts ("%", ";", "`", "{"), so
// "https://evil.example;.push.apple.com" passed a suffix check and then connected to evil.example.
// web-push 4 parses with URL, but the check stays strict so no parser can read another host.
const PLAIN_HOSTNAME = /^[a-z0-9-]+(\.[a-z0-9-]+)+$/;

/**
 * Whether the server may send to this endpoint. Also checked before each send, for endpoints
 * stored before this check was as strict as it is now.
 */
export function isPushService(endpoint: string): boolean {
  const url = URL.parse(endpoint);
  if (url?.protocol !== "https:" || url.port !== "") return false;
  // The exact string we store is the one web-push will parse, so it must already be canonical
  // (no backslashes, case or encoding that URL rewrites) and carry no user info.
  if (url.href !== endpoint || url.username !== "" || url.password !== "") return false;
  if (!PLAIN_HOSTNAME.test(url.hostname)) return false;
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

export const settingsBody = z
  .object({
    // A time of day, "HH:MM"
    remindAt: z
      .string()
      .regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Use a time like 08:00.")
      .transform((value) => Temporal.PlainTime.from(value))
      .optional(),
    dailySummary: z.boolean().optional(),
    shoppingTrips: z.boolean().optional(),
  })
  .refine((body) => Object.values(body).some((value) => value !== undefined), {
    message: "Nothing to change.",
  });

export type SettingsInput = z.output<typeof settingsBody>;
export type SubscribeInput = z.infer<typeof subscribeBody>;
