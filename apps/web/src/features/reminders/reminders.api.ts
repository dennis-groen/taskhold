import { api, parseResponse, type InferResponseType } from "@/lib/api-client.ts";

const reminders = api.reminders;

export type ReminderStatus = InferResponseType<typeof reminders.$get, 200>;

export async function fetchReminderStatus(): Promise<ReminderStatus> {
  return parseResponse(reminders.$get());
}

/** Registers this device's push subscription, with the time zone the device is in now */
export async function saveDevice(subscription: PushSubscription): Promise<ReminderStatus> {
  const { endpoint, keys } = subscription.toJSON();
  if (!endpoint || !keys?.p256dh || !keys.auth)
    throw new Error("The browser gave an incomplete subscription.");
  return parseResponse(
    reminders.subscription.$put({
      json: {
        subscription: { endpoint, keys: { p256dh: keys.p256dh, auth: keys.auth } },
        timeZone: Temporal.Now.timeZoneId(),
      },
    }),
  );
}

export async function updateRemindAt(remindAt: string): Promise<ReminderStatus> {
  return parseResponse(reminders.settings.$patch({ json: { remindAt } }));
}

/** Returns how many devices got the test notification */
export async function sendTestReminder(): Promise<number> {
  return (await parseResponse(reminders.test.$post())).sent;
}
