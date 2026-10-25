import { relations } from "drizzle-orm";
import { index, pgEnum, pgTable, text, timestamp } from "drizzle-orm/pg-core";

// Schema files may reference other features' tables: foreign keys cross slices by nature
import { user } from "../auth/auth.schema.ts";

export const householdRole = pgEnum("household_role", ["owner", "member"]);
export type HouseholdRole = (typeof householdRole.enumValues)[number];

export const household = pgTable("household", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  name: text("name").notNull(),
  inviteCode: text("invite_code").notNull().unique(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at")
    .defaultNow()
    .$onUpdate(() => new Date())
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
    joinedAt: timestamp("joined_at").defaultNow().notNull(),
  },
  (table) => [index("household_member_householdId_idx").on(table.householdId)],
);

export const householdRelations = relations(household, ({ many }) => ({
  members: many(householdMember),
}));

export const householdMemberRelations = relations(householdMember, ({ one }) => ({
  household: one(household, {
    fields: [householdMember.householdId],
    references: [household.id],
  }),
  user: one(user, {
    fields: [householdMember.userId],
    references: [user.id],
  }),
}));
