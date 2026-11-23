// The feature's contract: request input and the shapes returned to clients, as zod schemas
// and their inferred types. Response shapes are inferred from the Drizzle table columns.
import { createInsertSchema, createSelectSchema } from "drizzle-orm/zod";
import { z } from "zod";

import { instantSchema } from "../../db/zod.ts";
import { user } from "../auth/auth.table.ts";
import { household, householdMember } from "./households.table.ts";

export const createHouseholdBody = createInsertSchema(household, {
  name: (schema) =>
    schema
      .trim()
      .min(1, "Give your household a name.")
      .max(60, "Keep the name under 60 characters."),
}).pick({ name: true });

export const inviteCodeParam = z.object({
  code: z.string().min(1).max(64),
});

export const memberParam = z.object({
  userId: z.string().min(1).max(64),
});

export type CreateHouseholdInput = z.output<typeof createHouseholdBody>;

const householdColumns = createSelectSchema(household, {
  createdAt: (schema) => schema.pipe(instantSchema),
  updatedAt: (schema) => schema.pipe(instantSchema),
});
const memberColumns = createSelectSchema(householdMember, {
  joinedAt: (schema) => schema.pipe(instantSchema),
});
const userColumns = createSelectSchema(user);
const userDisplaySchema = userColumns.pick({ name: true, image: true });

export const householdMemberSchema = memberColumns.pick({ role: true, joinedAt: true }).extend({
  id: userColumns.shape.id,
  name: userColumns.shape.name,
  image: userColumns.shape.image,
});

export const householdSchema = householdColumns
  .pick({ id: true, name: true, inviteCode: true })
  .extend({ members: z.array(householdMemberSchema) });

export const membershipSchema = z.object({
  id: householdColumns.shape.id,
  name: householdColumns.shape.name,
  role: memberColumns.shape.role,
});

/** What someone holding an invite code may see before joining: no emails, no code */
export const invitePreviewSchema = z.object({
  householdName: householdColumns.shape.name,
  members: z.array(userDisplaySchema),
});

export const membershipRecordSchema = z.object({
  householdId: householdColumns.shape.id,
  householdName: householdColumns.shape.name,
  role: memberColumns.shape.role,
});

export const memberRecordSchema = z.object({
  userId: userColumns.shape.id,
  name: userColumns.shape.name,
  image: userColumns.shape.image,
  role: memberColumns.shape.role,
  joinedAt: memberColumns.shape.joinedAt,
});

export const householdRecordSchema = householdColumns
  .pick({ id: true, name: true, inviteCode: true })
  .extend({ members: z.array(memberRecordSchema) });

export type Household = z.infer<typeof householdSchema>;
export type Membership = z.infer<typeof membershipSchema>;
export type InvitePreview = z.infer<typeof invitePreviewSchema>;
export type MembershipRecord = z.infer<typeof membershipRecordSchema>;
export type HouseholdRecord = z.infer<typeof householdRecordSchema>;
