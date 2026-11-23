// Data access for chore reminders: the only place that queries the push subscription and
// reminder setting tables.
import { and, desc, eq, exists, isNull, lt, notInArray, or } from "drizzle-orm";

import { db, type Executor } from "../../db/db.ts";
import { pushSubscription, reminderSetting } from "./reminders.table.ts";

export type SubscriptionValues = {
  userId: string;
  endpoint: string;
  p256dh: string;
  auth: string;
};
export type SubscriptionRecord = Pick<SubscriptionValues, "endpoint" | "p256dh" | "auth">;
export type SettingRecord = typeof reminderSetting.$inferSelect;

/**
 * Adds the device, or hands it to this user if someone else had it (they signed in there). Either
 * way it counts as subscribed now, so it's the last of the person's devices to be dropped.
 *
 * A device already stored only changes hands when the request has its secret, which the browser
 * it belongs to always sends: knowing an endpoint isn't enough to take it. False when it didn't.
 */
export async function upsertSubscription(
  values: SubscriptionValues,
  executor: Executor = db,
): Promise<boolean> {
  const rows = await executor
    .insert(pushSubscription)
    .values(values)
    .onConflictDoUpdate({
      target: pushSubscription.endpoint,
      set: {
        userId: values.userId,
        p256dh: values.p256dh,
        auth: values.auth,
        createdAt: Temporal.Now.instant(),
      },
      setWhere: eq(pushSubscription.auth, values.auth),
    })
    .returning({ id: pushSubscription.id });
  return rows.length > 0;
}

/** Deletes the person's devices except the `keep` most recently subscribed */
export async function deleteOldestSubscriptions(
  userId: string,
  keep: number,
  executor: Executor = db,
): Promise<number> {
  const newest = executor
    .select({ id: pushSubscription.id })
    .from(pushSubscription)
    .where(eq(pushSubscription.userId, userId))
    .orderBy(desc(pushSubscription.createdAt), desc(pushSubscription.id))
    .limit(keep);
  const rows = await executor
    .delete(pushSubscription)
    .where(and(eq(pushSubscription.userId, userId), notInArray(pushSubscription.id, newest)))
    .returning({ id: pushSubscription.id });
  return rows.length;
}

export async function deleteSubscription(
  ref: { userId: string; endpoint: string },
  executor: Executor = db,
): Promise<boolean> {
  const rows = await executor
    .delete(pushSubscription)
    .where(
      and(eq(pushSubscription.userId, ref.userId), eq(pushSubscription.endpoint, ref.endpoint)),
    )
    .returning({ id: pushSubscription.id });
  return rows.length > 0;
}

/** For subscriptions the push service says no longer exist */
export async function deleteSubscriptionByEndpoint(
  endpoint: string,
  executor: Executor = db,
): Promise<void> {
  await executor.delete(pushSubscription).where(eq(pushSubscription.endpoint, endpoint));
}

export async function findSubscriptions(
  userId: string,
  executor: Executor = db,
): Promise<SubscriptionRecord[]> {
  return executor
    .select({
      endpoint: pushSubscription.endpoint,
      p256dh: pushSubscription.p256dh,
      auth: pushSubscription.auth,
    })
    .from(pushSubscription)
    .where(eq(pushSubscription.userId, userId));
}

export async function findSetting(
  userId: string,
  executor: Executor = db,
): Promise<SettingRecord | null> {
  const [row] = await executor
    .select()
    .from(reminderSetting)
    .where(eq(reminderSetting.userId, userId));
  return row ?? null;
}

/** Creates the setting with `remindAt`, or only updates the time zone if it exists */
export async function upsertSetting(
  values: { userId: string; remindAt: Temporal.PlainTime; timeZone: string },
  executor: Executor = db,
): Promise<void> {
  await executor
    .insert(reminderSetting)
    .values(values)
    .onConflictDoUpdate({ target: reminderSetting.userId, set: { timeZone: values.timeZone } });
}

export async function updateSettings(
  userId: string,
  changes: Partial<{ remindAt: Temporal.PlainTime; dailySummary: boolean; shoppingTrips: boolean }>,
  executor: Executor = db,
): Promise<boolean> {
  const rows = await executor
    .update(reminderSetting)
    .set(changes)
    .where(eq(reminderSetting.userId, userId))
    .returning({ userId: reminderSetting.userId });
  return rows.length > 0;
}

/** Settings of everyone who wants the daily summary and has a device to send it to */
export async function findDailySummarySettings(executor: Executor = db): Promise<SettingRecord[]> {
  return executor
    .select()
    .from(reminderSetting)
    .where(
      and(
        eq(reminderSetting.dailySummary, true),
        exists(
          executor
            .select({ id: pushSubscription.id })
            .from(pushSubscription)
            .where(eq(pushSubscription.userId, reminderSetting.userId)),
        ),
      ),
    );
}

/**
 * Marks `date` as the day the person's summary went out. False when it already had, e.g. another
 * API instance got there first, so each person gets at most one summary a day.
 */
export async function claimDay(
  userId: string,
  date: Temporal.PlainDate,
  executor: Executor = db,
): Promise<boolean> {
  const rows = await executor
    .update(reminderSetting)
    .set({ lastSentOn: date })
    .where(
      and(
        eq(reminderSetting.userId, userId),
        or(isNull(reminderSetting.lastSentOn), lt(reminderSetting.lastSentOn, date)),
      ),
    )
    .returning({ userId: reminderSetting.userId });
  return rows.length > 0;
}

/**
 * Records a test notification sent now. False when the person sent one since `sentBefore`, or has
 * no setting; the check and the write are one statement, so two requests can't both pass.
 */
export async function claimTestSend(
  userId: string,
  sentBefore: Temporal.Instant,
  executor: Executor = db,
): Promise<boolean> {
  const rows = await executor
    .update(reminderSetting)
    .set({ lastTestAt: Temporal.Now.instant() })
    .where(
      and(
        eq(reminderSetting.userId, userId),
        or(isNull(reminderSetting.lastTestAt), lt(reminderSetting.lastTestAt, sentBefore)),
      ),
    )
    .returning({ userId: reminderSetting.userId });
  return rows.length > 0;
}
