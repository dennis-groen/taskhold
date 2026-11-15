// Chore reminders: one push notification a day, at the time each person picks in their own time
// zone, listing their chores that are due or overdue. Their chores are the ones assigned to them
// or to nobody. Each device subscribes on its own; the time is per person.
import { transaction } from "../../db/db.ts";
import { logger } from "../../lib/logger.ts";
import { pushConfigured, sendPush, type PushMessage, type SendPush } from "../../lib/push.ts";
import { annotate, describeError } from "../../lib/wide-event.ts";
import * as choresService from "../chores/chores.service.ts";
import { env } from "../../env.ts";
import * as remindersRepo from "./reminders.repo.ts";
import {
  noReminderDevices,
  pushDeviceTaken,
  remindersOff,
  remindersUnavailable,
  testSentRecently,
} from "./reminders.errors.ts";
import { isPushService, type SubscribeInput } from "./reminders.schema.ts";

const DEFAULT_REMIND_AT = Temporal.PlainTime.from("08:00");
// A summary names this many chores, then says how many more there are
const NAMES_SHOWN = 4;
// Each device is a push request every day, and a stored endpoint; a household's phones, tablets
// and browsers fit well within this. Subscribing another drops the one subscribed longest ago.
const MAX_DEVICES = 10;
// A test notification goes to every device, so one per person per minute
const TEST_INTERVAL = Temporal.Duration.from({ minutes: 1 });

export async function getStatus(userId: string) {
  const setting = await remindersRepo.findSetting(userId);
  return {
    available: pushConfigured,
    // The key browsers need to subscribe; public by design
    publicKey: pushConfigured ? (env.VAPID_PUBLIC_KEY ?? null) : null,
    settings: setting && {
      remindAt: setting.remindAt.toString({ smallestUnit: "minute" }),
      timeZone: setting.timeZone,
    },
  };
}

/** Turns reminders on for this device. The first device sets the time to 08:00. */
export async function subscribe(userId: string, input: SubscribeInput): Promise<void> {
  if (!pushConfigured) throw remindersUnavailable();
  const { endpoint, keys } = input.subscription;
  await transaction(async (tx) => {
    const saved = await remindersRepo.upsertSubscription({ userId, endpoint, ...keys }, tx);
    if (!saved) throw pushDeviceTaken();
    const dropped = await remindersRepo.deleteOldestSubscriptions(userId, MAX_DEVICES, tx);
    if (dropped > 0) annotate("reminders", { devices_dropped: dropped });
    await remindersRepo.upsertSetting(
      { userId, remindAt: DEFAULT_REMIND_AT, timeZone: input.timeZone },
      tx,
    );
  });
  annotate("reminders", { subscribed: true });
}

/** Turns reminders off for this device. Unsubscribing one that's already gone succeeds. */
export async function unsubscribe(userId: string, endpoint: string): Promise<void> {
  const removed = await remindersRepo.deleteSubscription({ userId, endpoint });
  annotate("reminders", { unsubscribed: removed });
}

export async function updateRemindAt(userId: string, remindAt: Temporal.PlainTime): Promise<void> {
  if (!(await remindersRepo.updateRemindAt(userId, remindAt))) throw remindersOff();
}

/** Sends a notification to each of the person's devices, so they can see reminders work */
export async function sendTest(userId: string, send: SendPush = sendPush): Promise<number> {
  if (!pushConfigured) throw remindersUnavailable();
  const devices = await remindersRepo.findSubscriptions(userId);
  if (devices.length === 0) throw noReminderDevices();
  const sentBefore = Temporal.Now.instant().subtract(TEST_INTERVAL);
  if (!(await remindersRepo.claimTestSend(userId, sentBefore))) throw testSentRecently();
  const sent = await deliver(
    devices,
    {
      title: "Reminders are on",
      body: "Chores that are due will show up here every day.",
      url: "/chores",
      tag: "chore-reminder-test",
    },
    send,
  );
  annotate("reminders", { test_devices: devices.length, test_sent: sent });
  return sent;
}

/**
 * Sends today's summary to everyone whose reminder time has come in their time zone and who
 * hasn't had one today. Runs every minute (reminders.scheduler.ts); after downtime, people whose
 * time passed meanwhile get theirs on the next run.
 */
export async function sendDueReminders(
  now: Temporal.Instant,
  send: SendPush = sendPush,
): Promise<{ people: number; notifications: number; failed: number }> {
  let people = 0;
  let notifications = 0;
  let failed = 0;
  for (const setting of await remindersRepo.findSettingsWithDevices()) {
    try {
      const sent = await remind(setting, now, send);
      if (sent === null) continue;
      people += 1;
      notifications += sent;
    } catch (err) {
      // One person's trouble mustn't keep everyone after them waiting
      failed += 1;
      logger.warn(
        { component: "reminders", user_id: setting.userId, error: describeError(err) },
        "Couldn't send a person's chore reminder",
      );
    }
  }
  return { people, notifications, failed };
}

/** Sends one person today's summary if it's time. Returns how many devices got it; null when nothing was due to send. */
async function remind(
  setting: remindersRepo.SettingRecord,
  now: Temporal.Instant,
  send: SendPush,
): Promise<number | null> {
  const local = now.toZonedDateTimeISO(setting.timeZone);
  const today = local.toPlainDate();
  if (Temporal.PlainTime.compare(local.toPlainTime(), setting.remindAt) < 0) return null;
  if (setting.lastSentOn && Temporal.PlainDate.compare(setting.lastSentOn, today) >= 0) return null;
  // Claimed before sending, so two instances (or a slow run overlapping the next) don't both send
  if (!(await remindersRepo.claimDay(setting.userId, today))) return null;

  const due = await choresService.findDueChores(setting.userId, today);
  const message = summary(due);
  if (!message) return null;
  const devices = await remindersRepo.findSubscriptions(setting.userId);
  return deliver(devices, message, send);
}

/**
 * Sends to the person's devices at the same time, so one slow push service doesn't hold up the
 * rest, and forgets the devices that no longer exist. Returns how many got it.
 */
async function deliver(
  devices: remindersRepo.SubscriptionRecord[],
  message: PushMessage,
  send: SendPush,
): Promise<number> {
  const results = await Promise.all(
    devices.map(async (device) => {
      // Saved before the endpoint check was strict enough: never send to it, and forget it
      const result = isPushService(device.endpoint) ? await send(device, message) : "gone";
      if (result === "gone") await remindersRepo.deleteSubscriptionByEndpoint(device.endpoint);
      return result;
    }),
  );
  return results.filter((result) => result === "sent").length;
}

/** "2 chores today, 1 overdue" with their names, overdue first; null when nothing is due */
export function summary(due: { today: string[]; overdue: string[] }): PushMessage | null {
  const names = [...due.overdue, ...due.today];
  if (names.length === 0) return null;

  const parts = [];
  if (due.today.length > 0) parts.push(`${count(due.today.length)} today`);
  if (due.overdue.length > 0) {
    parts.push(
      due.today.length > 0
        ? `${due.overdue.length} overdue`
        : `${count(due.overdue.length)} overdue`,
    );
  }
  const shown = names.slice(0, NAMES_SHOWN);
  const more = names.length - shown.length;
  const body =
    more > 0
      ? `${shown.join(", ")} and ${more} more`
      : new Intl.ListFormat("en", { type: "conjunction" }).format(shown);
  return { title: parts.join(", "), body, url: "/chores", tag: "chore-reminder" };
}

function count(n: number): string {
  return n === 1 ? "1 chore" : `${n} chores`;
}
