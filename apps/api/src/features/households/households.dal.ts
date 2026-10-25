// Data access for households: the only place that queries household tables.
// Functions return plain records and take an optional executor so services can run them in a transaction.
import { asc, eq, type SQL } from "drizzle-orm";

import { db, type Executor } from "../../db/client.ts";
import { household, householdMember, type HouseholdRole } from "./households.schema.ts";

export type MembershipRecord = {
  householdId: string;
  householdName: string;
  role: HouseholdRole;
};

export type MemberRecord = {
  userId: string;
  name: string;
  image: string | null;
  role: HouseholdRole;
  joinedAt: Date;
};

export type HouseholdRecord = {
  id: string;
  name: string;
  inviteCode: string;
  members: MemberRecord[];
};

export async function findMembershipByUserId(
  userId: string,
  executor: Executor = db,
): Promise<MembershipRecord | null> {
  const rows = await executor
    .select({
      householdId: household.id,
      householdName: household.name,
      role: householdMember.role,
    })
    .from(householdMember)
    .innerJoin(household, eq(household.id, householdMember.householdId))
    .where(eq(householdMember.userId, userId))
    .limit(1);
  return rows[0] ?? null;
}

export function findHouseholdById(householdId: string, executor: Executor = db) {
  return findHousehold(eq(household.id, householdId), executor);
}

export function findHouseholdByInviteCode(inviteCode: string, executor: Executor = db) {
  return findHousehold(eq(household.inviteCode, inviteCode), executor);
}

async function findHousehold(where: SQL, executor: Executor): Promise<HouseholdRecord | null> {
  const row = await executor.query.household.findFirst({
    where,
    with: {
      members: {
        with: { user: { columns: { id: true, name: true, image: true } } },
        orderBy: [asc(householdMember.joinedAt)],
      },
    },
  });
  if (!row) return null;

  return {
    id: row.id,
    name: row.name,
    inviteCode: row.inviteCode,
    members: row.members.map((member) => ({
      userId: member.user.id,
      name: member.user.name,
      image: member.user.image,
      role: member.role,
      joinedAt: member.joinedAt,
    })),
  };
}

/** Returns null when the invite code is already taken, so the caller can try another */
export async function insertHousehold(
  values: { name: string; inviteCode: string },
  executor: Executor = db,
): Promise<{ id: string } | null> {
  const rows = await executor
    .insert(household)
    .values(values)
    .onConflictDoNothing({ target: household.inviteCode })
    .returning({ id: household.id });
  return rows[0] ?? null;
}

/** Returns false when the user already belongs to a household (one per user, enforced by the database) */
export async function insertMember(
  values: { householdId: string; userId: string; role: HouseholdRole },
  executor: Executor = db,
): Promise<boolean> {
  const rows = await executor
    .insert(householdMember)
    .values(values)
    .onConflictDoNothing({ target: householdMember.userId })
    .returning({ id: householdMember.id });
  return rows.length > 0;
}
