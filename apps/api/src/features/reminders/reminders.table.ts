import { boolean, index, pgTable, text } from "drizzle-orm/pg-core";

import { instant, now, plainDate, plainTime } from "../../db/columns.ts";

import { user } from "../auth/auth.table.ts";

// A browser or phone that gets chore reminders: the Web Push subscription it handed the app.
// The endpoint is unique per browser, so signing in as someone else there moves it to them.
// A person keeps only their most recently subscribed devices (see reminders.service.ts).
export const pushSubscription = pgTable(
  "push_subscription",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    endpoint: text("endpoint").notNull().unique(),
    // The browser's public key and secret, which encrypt what we send so only it can read it
    p256dh: text("p256dh").notNull(),
    auth: text("auth").notNull(),
    createdAt: instant("created_at").default(now).notNull(),
  },
  (table) => [index("push_subscription_userId_idx").on(table.userId)],
);

// When a person wants their daily summary. Made the first time they turn reminders on.
export const reminderSetting = pgTable("reminder_setting", {
  userId: text("user_id")
    .primaryKey()
    .references(() => user.id, { onDelete: "cascade" }),
  // Local time of day in `timeZone`, the zone of the device they last turned reminders on from
  remindAt: plainTime("remind_at").notNull(),
  timeZone: text("time_zone").notNull(),
  // Whether the person wants the daily summary. Off still keeps their devices for other notifications.
  dailySummary: boolean("daily_summary").default(true).notNull(),
  // Whether the person hears when someone in the household goes shopping
  shoppingTrips: boolean("shopping_trips").default(true).notNull(),
  // The local date of the last summary, so each day gets at most one
  lastSentOn: plainDate("last_sent_on"),
  // When the person last sent themselves a test notification, so they can't send one after another
  lastTestAt: instant("last_test_at"),
  updatedAt: instant("updated_at")
    .default(now)
    .$onUpdate(() => Temporal.Now.instant())
    .notNull(),
});
