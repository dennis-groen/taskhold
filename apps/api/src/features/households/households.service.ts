// Business rules for households: who can create, join, manage and see what.
// Talks to the DAL only, throws AppErrors, and knows nothing about HTTP.
//
// Every change to who is in a household runs in a transaction that locks the household row,
// so concurrent joins, leaves and removals in one household happen one at a time.
import { transaction, type Transaction } from "../../db/client.ts";
import * as householdsDal from "./households.dal.ts";
import {
  alreadyInHousehold,
  cannotRemoveSelf,
  inviteNotFound,
  memberNotFound,
  notInHousehold,
  ownerOnly,
} from "./households.errors.ts";
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
  await transaction(async (tx) => {
    // The household may have been deleted, or its code replaced, since we looked it up
    const locked = await householdsDal.lockHousehold(household.id, tx);
    if (!locked || locked.inviteCode !== household.inviteCode) throw inviteNotFound();

    const added = await householdsDal.insertMember(
      { householdId: household.id, userId, role: "member" },
      tx,
    );
    if (!added) throw alreadyInHousehold();
  });
  return getHousehold(household.id);
}

/**
 * Takes the user out of their household. If they were the owner, the member who joined
 * earliest takes over; if they were the last one, the household is deleted.
 */
export async function leaveHousehold(userId: string): Promise<{ householdDeleted: boolean }> {
  return transaction(async (tx) => {
    const membership = await lockMembershipOf(userId, tx);
    const { householdId } = membership;
    await householdsDal.deleteMember({ householdId, userId }, tx);

    const successor = await householdsDal.findEarliestMember(householdId, tx);
    if (!successor) {
      await householdsDal.deleteHousehold(householdId, tx);
      return { householdDeleted: true };
    }
    if (membership.role === "owner") {
      await householdsDal.setMemberRole(
        { householdId, userId: successor.userId, role: "owner" },
        tx,
      );
    }
    return { householdDeleted: false };
  });
}

/** Owner only: removes another member from the owner's household */
export async function removeMember(ownerId: string, memberId: string): Promise<Household> {
  if (ownerId === memberId) throw cannotRemoveSelf();

  const householdId = await transaction(async (tx) => {
    const owner = await lockMembershipOf(ownerId, tx, { ownerOnly: true });
    const removed = await householdsDal.deleteMember(
      { householdId: owner.householdId, userId: memberId },
      tx,
    );
    if (!removed) throw memberNotFound();
    return owner.householdId;
  });
  return getHousehold(householdId);
}

/** Owner only: replaces the invite code, so the old code and link stop working */
export async function regenerateInviteCode(ownerId: string): Promise<Household> {
  const householdId = await transaction(async (tx) => {
    const owner = await lockMembershipOf(ownerId, tx, { ownerOnly: true });
    for (let attempt = 0; attempt < MAX_INVITE_CODE_ATTEMPTS; attempt++) {
      if (await householdsDal.updateInviteCode(owner.householdId, generateInviteCode(), tx)) {
        return owner.householdId;
      }
    }
    throw new Error("Could not generate a unique invite code");
  });
  return getHousehold(householdId);
}

/**
 * Locks the user's household for the rest of the transaction and returns their membership,
 * read again after locking because another request may have changed it while we waited.
 */
async function lockMembershipOf(userId: string, tx: Transaction, options = { ownerOnly: false }) {
  const before = await householdsDal.findMembershipByUserId(userId, tx);
  if (!before) throw notInHousehold();

  await householdsDal.lockHousehold(before.householdId, tx);
  const membership = await householdsDal.findMembershipByUserId(userId, tx);
  if (!membership || membership.householdId !== before.householdId) throw notInHousehold();
  if (options.ownerOnly && membership.role !== "owner") throw ownerOnly();
  return membership;
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
