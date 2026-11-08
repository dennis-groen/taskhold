import { sql } from "drizzle-orm";
import { boolean, check, index, integer, pgEnum, pgTable, text } from "drizzle-orm/pg-core";

import { instant, now, plainDate } from "../../db/columns.ts";

import { user } from "../auth/auth.table.ts";
import { household } from "../households/households.table.ts";

export const repeatUnit = pgEnum("chore_repeat_unit", ["day", "week"]);
export type RepeatUnit = (typeof repeatUnit.enumValues)[number];

// Due dates are plain dates, with no time or timezone: "today" is whatever day it is for the
// person looking, so the client says which date it is when it marks a chore done
export const chore = pgTable(
  "chore",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    householdId: text("household_id")
      .notNull()
      .references(() => household.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    // Both null for a one-off chore, both set for one that repeats every N days or weeks
    repeatEvery: integer("repeat_every"),
    repeatUnit: repeatUnit("repeat_unit"),
    // When it's next due. A one-off chore may have none; a repeating one always has one.
    dueOn: plainDate("due_on"),
    // Who it's assigned to; anyone can still do it. Only meaningful while they're a member.
    assigneeId: text("assignee_id").references(() => user.id, { onDelete: "set null" }),
    createdAt: instant("created_at").default(now).notNull(),
    updatedAt: instant("updated_at")
      .default(now)
      .$onUpdate(() => Temporal.Now.instant())
      .notNull(),
  },
  (table) => [
    index("chore_householdId_idx").on(table.householdId),
    check(
      "chore_repeat_check",
      sql`(${table.repeatEvery} is null and ${table.repeatUnit} is null) or (${table.repeatEvery} > 0 and ${table.repeatUnit} is not null and ${table.dueOn} is not null)`,
    ),
  ],
);

// Every time a chore was done or skipped. The latest one can be undone, which puts the due date
// back.
export const choreCompletion = pgTable(
  "chore_completion",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    choreId: text("chore_id")
      .notNull()
      .references(() => chore.id, { onDelete: "cascade" }),
    // People can leave or delete their account; what they did stays in the history
    completedById: text("completed_by_id").references(() => user.id, { onDelete: "set null" }),
    // The date where the person was when they did it, which the next due date counts from
    completedOn: plainDate("completed_on").notNull(),
    // Skipped rather than done: it moved the due date on, but nobody did the chore that time
    skipped: boolean("skipped").default(false).notNull(),
    // The chore's due date before this completion moved it, so undoing can restore it
    previousDueOn: plainDate("previous_due_on"),
    createdAt: instant("created_at").default(now).notNull(),
  },
  (table) => [index("chore_completion_choreId_createdAt_idx").on(table.choreId, table.createdAt)],
);
