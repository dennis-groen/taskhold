import { boolean, index, integer, pgEnum, pgTable, text } from "drizzle-orm/pg-core";

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
  // A demo visitor's sandbox (features/demo): nobody joins it with its code, and it's deleted after
  // a day along with its members
  demo: boolean("demo").default(false).notNull(),
  // Changes made in a demo household so far, against its budget (features/demo)
  demoWrites: integer("demo_writes").default(0).notNull(),
  // The address a demo was started from, as Better Auth records it (an IPv6 address by its /64,
  // empty when it couldn't be told), for the per-address limit (features/demo)
  demoIp: text("demo_ip"),
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

// One row per invite code that didn't match a household, so guessing codes can be capped per person.
// Keyed by the sign-in identity (e.g. "google:<account id>") rather than the user row, with no
// foreign key: deleting the account and signing in again must not reset the budget.
export const inviteCodeAttempt = pgTable(
  "invite_code_attempt",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    // Null only on rows from before this column existed, which no count matches
    identity: text("identity"),
    attemptedAt: instant("attempted_at").default(now).notNull(),
  },
  (table) => [
    index("invite_code_attempt_identity_attemptedAt_idx").on(table.identity, table.attemptedAt),
  ],
);
