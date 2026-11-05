// Sends Web Push messages (chore reminders) through the browser vendors' push services.
// Payloads are encrypted for the receiving browser, so push services can't read them.
import webPush from "web-push";

import { env } from "../env.ts";
import { logger } from "./logger.ts";
import { describeError } from "./wide-event.ts";

// A CommonJS module whose functions Node doesn't expose as named imports
const { WebPushError, sendNotification, setVapidDetails } = webPush;

/** Whether this server has VAPID keys, without which nothing can be sent */
export const pushConfigured = Boolean(env.VAPID_PUBLIC_KEY && env.VAPID_PRIVATE_KEY);

// Push services only take an https: or mailto: contact; in development the app runs on http:
const appUrl = new URL(env.BETTER_AUTH_URL);
const subject =
  env.VAPID_SUBJECT ??
  (appUrl.protocol === "https:" ? appUrl.origin : "mailto:reminders@localhost");

if (env.VAPID_PUBLIC_KEY && env.VAPID_PRIVATE_KEY) {
  setVapidDetails(subject, env.VAPID_PUBLIC_KEY, env.VAPID_PRIVATE_KEY);
}

export type PushTarget = { endpoint: string; p256dh: string; auth: string };

/** What the service worker shows (see apps/web/public/push-handler.js) */
export type PushMessage = { title: string; body: string; url: string; tag: string };

/** "gone": the subscription no longer exists and should be forgotten */
export type PushResult = "sent" | "gone" | "failed";

export type SendPush = (target: PushTarget, message: PushMessage) => Promise<PushResult>;

// A reminder that can't be delivered within half a day is no longer useful
const TIME_TO_LIVE = Temporal.Duration.from({ hours: 12 });
const TIMEOUT = Temporal.Duration.from({ seconds: 10 });

export const sendPush: SendPush = async (target, message) => {
  try {
    await sendNotification(
      { endpoint: target.endpoint, keys: { p256dh: target.p256dh, auth: target.auth } },
      JSON.stringify(message),
      { TTL: TIME_TO_LIVE.total("seconds"), timeout: TIMEOUT.total("milliseconds") },
    );
    return "sent";
  } catch (err) {
    if (err instanceof WebPushError && (err.statusCode === 404 || err.statusCode === 410)) {
      return "gone";
    }
    // Only the host: the endpoint's path identifies the device
    const host = URL.parse(target.endpoint)?.host;
    logger.warn({ error: describeError(err), push_host: host }, "Couldn't send a push message");
    return "failed";
  }
};
