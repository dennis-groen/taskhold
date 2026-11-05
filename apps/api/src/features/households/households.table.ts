import { index, pgEnum, pgTable, text } from "drizzle-orm/pg-core";

import { instant, now } from "../../db/columns.ts";

// Schema files may reference other features' tables: foreign keys cross slices by nature
import { user } from "../auth/auth.table.ts";

export const householdRole = pgEnum("household_role", ["owner", "member"]);
export type HouseholdRole = (typeof householdRole.enumValues)[number];

export const household = pgTable("household", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  name: text("name").notNull(),
  inviteCode: text("invite_code").notNull().unique(),
  createdAt: instant("created_at").default(now).notNull(),
  updatedAt: instant("updated_at")
    .default(now)
    .$onUpdate(() => Temporal.Now.instant())
    .notNull(),
});

export const householdMember = pgTable(
  "household_member",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    householdId: text("household_id")
      .notNull()
      .references(() => household.id, { onDelete: "cascade" }),
    // Unique: a user belongs to at most one household
    userId: text("user_id")
      .notNull()
      .unique()
      .references(() => user.id, { onDelete: "cascade" }),
    role: householdRole("role").notNull(),
    joinedAt: instant("joined_at").default(now).notNull(),
  },
  (table) => [index("household_member_householdId_idx").on(table.householdId)],
);

// One row per invite code that didn't match a household, so guessing codes can be capped per account
export const inviteCodeAttempt = pgTable(
  "invite_code_attempt",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    attemptedAt: instant("attempted_at").default(now).notNull(),
  },
  (table) => [
    index("invite_code_attempt_userId_attemptedAt_idx").on(table.userId, table.attemptedAt),
  ],
);
