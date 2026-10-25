// Business rules for households: who can create, join and see what.
// Talks to the DAL only, throws AppErrors, and knows nothing about HTTP.
import { transaction, type Transaction } from "../../db/client.ts";
import * as householdsDal from "./households.dal.ts";
import { alreadyInHousehold, inviteNotFound, notInHousehold } from "./households.errors.ts";
import type { Household, InvitePreview, Membership } from "./households.types.ts";
import { generateInviteCode, normalizeInviteCode } from "./invite-code.ts";

const MAX_INVITE_CODE_ATTEMPTS = 5;

/** The household a user belongs to, or null when they haven't created or joined one */
export async function findMembership(userId: string): Promise<Membership | null> {
  const membership = await householdsDal.findMembershipByUserId(userId);
  return membership
    ? { id: membership.householdId, name: membership.householdName, role: membership.role }
    : null;
}

export async function getHouseholdOf(userId: string): Promise<Household> {
  const membership = await householdsDal.findMembershipByUserId(userId);
  if (!membership) throw notInHousehold();
  return getHousehold(membership.householdId);
}

/** Creates a household with the user as its owner. Fails if they're already in one. */
export async function createHousehold(userId: string, name: string): Promise<Household> {
  const householdId = await transaction(async (tx) => {
    const created = await insertWithFreshInviteCode(name, tx);
    const added = await householdsDal.insertMember(
      { householdId: created.id, userId, role: "owner" },
      tx,
    );
    // Throwing rolls back the household created above
    if (!added) throw alreadyInHousehold();
    return created.id;
  });
  return getHousehold(householdId);
}

export async function previewInvite(rawCode: string): Promise<InvitePreview> {
  const household = await findByInviteCode(rawCode);
  return {
    householdName: household.name,
    members: household.members.map(({ name, image }) => ({ name, image })),
  };
}

/** Adds the user to the household behind the code. Fails if they're already in one. */
export async function acceptInvite(userId: string, rawCode: string): Promise<Household> {
  const household = await findByInviteCode(rawCode);
  const added = await householdsDal.insertMember({
    householdId: household.id,
    userId,
    role: "member",
  });
  if (!added) throw alreadyInHousehold();
  return getHousehold(household.id);
}

async function getHousehold(householdId: string): Promise<Household> {
  const household = await householdsDal.findHouseholdById(householdId);
  // Callers only pass ids they just read or wrote, so a miss means the data changed underneath us
  if (!household) throw new Error(`Household ${householdId} not found`);

  return {
    id: household.id,
    name: household.name,
    inviteCode: household.inviteCode,
    members: household.members.map(({ userId, ...member }) => ({ id: userId, ...member })),
  };
}

async function findByInviteCode(rawCode: string) {
  const code = normalizeInviteCode(rawCode);
  const household = code ? await householdsDal.findHouseholdByInviteCode(code) : null;
  if (!household) throw inviteNotFound();
  return household;
}

async function insertWithFreshInviteCode(name: string, tx: Transaction) {
  for (let attempt = 0; attempt < MAX_INVITE_CODE_ATTEMPTS; attempt++) {
    const created = await householdsDal.insertHousehold(
      { name, inviteCode: generateInviteCode() },
      tx,
    );
    if (created) return created;
  }
  throw new Error("Could not generate a unique invite code");
}
