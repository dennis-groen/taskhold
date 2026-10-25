import { asc, eq } from "drizzle-orm";

import { db } from "./db/index.ts";
import { household, householdMember } from "./db/schema.ts";
import { ApiError, isUniqueViolation } from "./lib/errors.ts";
import { generateInviteCode } from "./lib/invite-code.ts";

const alreadyInHousehold = () =>
  new ApiError(409, "ALREADY_IN_HOUSEHOLD", "You're already in a household.");

const membersWithUsers = {
  with: { user: { columns: { id: true, name: true, image: true } as const } },
  orderBy: [asc(householdMember.joinedAt)],
};

type Membership = { id: string; name: string; role: (typeof householdMember.$inferSelect)["role"] };

/** The household a user belongs to, or null when they haven't created or joined one. */
export async function findMembership(userId: string): Promise<Membership | null> {
  const rows = await db
    .select({ id: household.id, name: household.name, role: householdMember.role })
    .from(householdMember)
    .innerJoin(household, eq(household.id, householdMember.householdId))
    .where(eq(householdMember.userId, userId))
    .limit(1);
  return rows[0] ?? null;
}

/** Full household with members; only call it for a household the user belongs to. */
export async function getHouseholdDetail(householdId: string) {
  const row = await db.query.household.findFirst({
    where: eq(household.id, householdId),
    with: { members: membersWithUsers },
  });
  if (!row) throw new Error(`Household ${householdId} not found`);

  return {
    id: row.id,
    name: row.name,
    inviteCode: row.inviteCode,
    members: row.members.map((member) => ({
      id: member.user.id,
      name: member.user.name,
      image: member.user.image,
      role: member.role,
      joinedAt: member.joinedAt,
    })),
  };
}

export async function createHousehold(userId: string, name: string) {
  // Retry only on the (very unlikely) invite code collision
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      return await db.transaction(async (tx) => {
        const [created] = await tx
          .insert(household)
          .values({ name, inviteCode: generateInviteCode() })
          .returning({ id: household.id });
        if (!created) throw new Error("Household insert returned no row");
        await tx.insert(householdMember).values({ householdId: created.id, userId, role: "owner" });
        return created.id;
      });
    } catch (err) {
      if (isUniqueViolation(err, "household_member_user_id_unique")) throw alreadyInHousehold();
      if (isUniqueViolation(err, "household_invite_code_unique")) continue;
      throw err;
    }
  }
  throw new Error("Could not generate a unique invite code");
}

export async function findHouseholdByInviteCode(inviteCode: string) {
  const row = await db.query.household.findFirst({
    where: eq(household.inviteCode, inviteCode),
    with: { members: membersWithUsers },
  });
  if (!row) return null;

  return {
    id: row.id,
    name: row.name,
    // Invitees see who they'd be joining, but not emails or the invite code itself
    members: row.members.map((member) => ({ name: member.user.name, image: member.user.image })),
  };
}

export async function joinHousehold(userId: string, householdId: string) {
  try {
    await db.insert(householdMember).values({ householdId, userId, role: "member" });
  } catch (err) {
    if (isUniqueViolation(err, "household_member_user_id_unique")) throw alreadyInHousehold();
    throw err;
  }
}
