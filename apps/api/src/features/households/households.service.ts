// Business rules for households: who can create, join, manage and see what.
// Talks to the DAL only, throws AppErrors, and knows nothing about HTTP.
//
// Every change to who is in a household runs in a transaction that locks the household row,
// so concurrent joins, leaves and removals in one household happen one at a time.
import { transaction, type Transaction } from "../../db/client.ts";
import { announce } from "../../lib/live-changes.ts";
import { annotate } from "../../lib/wide-event.ts";
import * as householdsDal from "./households.dal.ts";
import {
  alreadyInHousehold,
  cannotRemoveSelf,
  inviteNotFound,
  memberNotFound,
  notInHousehold,
  ownerOnly,
  tooManyInviteAttempts,
} from "./households.errors.ts";
import type { Household, InvitePreview, Membership } from "./households.types.ts";
import type { CreateHouseholdInput } from "./households.validation.ts";
import { generateInviteCode, normalizeInviteCode } from "./invite-code.ts";

const MAX_INVITE_CODE_ATTEMPTS = 5;

// An invite code is the only thing needed to join a household, so each account gets a small
// budget of codes that match nothing. With 40-bit codes this makes guessing any household's code
// take far longer than an account is worth.
const INVITE_GUESS_LIMIT = 10;
const INVITE_GUESS_WINDOW = Temporal.Duration.from({ minutes: 15 });

/** The household a user belongs to, or null when they haven't created or joined one */
export async function findMembership(userId: string): Promise<Membership | null> {
  const membership = await householdsDal.findMembershipByUserId(userId);
  if (!membership) return null;
  annotate("household", { id: membership.householdId, role: membership.role });
  return { id: membership.householdId, name: membership.householdName, role: membership.role };
}

/** Like findMembership, for features that only work inside a household */
export async function getMembershipOf(userId: string): Promise<Membership> {
  const membership = await findMembership(userId);
  if (!membership) throw notInHousehold();
  return membership;
}

/** Whether someone is in this household right now, e.g. before assigning them something */
export function isMemberOf(householdId: string, userId: string): Promise<boolean> {
  return householdsDal.isMember({ householdId, userId });
}

export async function getHouseholdOf(userId: string): Promise<Household> {
  const membership = await householdsDal.findMembershipByUserId(userId);
  if (!membership) throw notInHousehold();
  annotate("household", { id: membership.householdId, role: membership.role });
  return getHousehold(membership.householdId);
}

/** Creates a household with the user as its owner. Fails if they're already in one. */
export async function createHousehold(
  userId: string,
  name: CreateHouseholdInput["name"],
): Promise<Household> {
  const householdId = await transaction(async (tx) => {
    const created = await insertWithFreshInviteCode(name, tx);
    const added = await householdsDal.insertMember(
      { householdId: created.id, userId, role: "owner" },
      tx,
    );
    // Throwing rolls back the household created above
    if (!added) throw alreadyInHousehold();
    await membershipChanged({ userId }, tx);
    return created.id;
  });
  annotate("household", { id: householdId, role: "owner" });
  return getHousehold(householdId);
}

export async function previewInvite(userId: string, rawCode: string): Promise<InvitePreview> {
  const household = await findByInviteCode(userId, rawCode);
  return {
    householdName: household.name,
    members: household.members.map(({ name, image }) => ({ name, image })),
  };
}

/** Adds the user to the household behind the code. Fails if they're already in one. */
export async function acceptInvite(userId: string, rawCode: string): Promise<Household> {
  const household = await findByInviteCode(userId, rawCode);
  await transaction(async (tx) => {
    // The household may have been deleted, or its code replaced, since we looked it up
    const locked = await householdsDal.lockHousehold(household.id, tx);
    if (!locked || locked.inviteCode !== household.inviteCode) throw inviteNotFound();

    const added = await householdsDal.insertMember(
      { householdId: household.id, userId, role: "member" },
      tx,
    );
    if (!added) throw alreadyInHousehold();
    await membershipChanged({ householdId: household.id, userId }, tx);
  });
  annotate("household", { id: household.id, role: "member" });
  return getHousehold(household.id);
}

/**
 * Takes the user out of their household. If they were the owner, the member who joined
 * earliest takes over; if they were the last one, the household is deleted.
 */
export async function leaveHousehold(userId: string): Promise<{ householdDeleted: boolean }> {
  return transaction((tx) => leave(userId, tx));
}

/**
 * For deleting an account: leaves the user's household the same way, in the caller's
 * transaction, and does nothing when they aren't in one
 */
export async function leaveAnyHousehold(userId: string, tx: Transaction): Promise<void> {
  if (await householdsDal.findMembershipByUserId(userId, tx)) await leave(userId, tx);
}

async function leave(userId: string, tx: Transaction): Promise<{ householdDeleted: boolean }> {
  const membership = await lockMembershipOf(userId, tx);
  const { householdId } = membership;
  await householdsDal.deleteMember({ householdId, userId }, tx);
  await membershipChanged({ householdId, userId }, tx);

  const successor = await householdsDal.findEarliestMember(householdId, tx);
  if (!successor) {
    await householdsDal.deleteHousehold(householdId, tx);
    annotate("household", { deleted: true });
    return { householdDeleted: true };
  }
  if (membership.role === "owner") {
    await householdsDal.setMemberRole({ householdId, userId: successor.userId, role: "owner" }, tx);
    annotate("household", { new_owner_id: successor.userId });
  }
  return { householdDeleted: false };
}

/**
 * Owner only: removes another member from the owner's household. The invite code is replaced
 * too: every member can see it, so the removed member would otherwise still know how to rejoin.
 */
export async function removeMember(ownerId: string, memberId: string): Promise<Household> {
  if (ownerId === memberId) throw cannotRemoveSelf();

  const householdId = await transaction(async (tx) => {
    const owner = await lockMembershipOf(ownerId, tx, { ownerOnly: true });
    const removed = await householdsDal.deleteMember(
      { householdId: owner.householdId, userId: memberId },
      tx,
    );
    if (!removed) throw memberNotFound();
    await replaceInviteCode(owner.householdId, tx);
    await membershipChanged({ householdId: owner.householdId, userId: memberId }, tx);
    annotate("household", { removed_member_id: memberId });
    return owner.householdId;
  });
  return getHousehold(householdId);
}

/** Owner only: replaces the invite code, so the old code and link stop working */
export async function regenerateInviteCode(ownerId: string): Promise<Household> {
  const householdId = await transaction(async (tx) => {
    const owner = await lockMembershipOf(ownerId, tx, { ownerOnly: true });
    await replaceInviteCode(owner.householdId, tx);
    await membershipChanged({ householdId: owner.householdId }, tx);
    return owner.householdId;
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
  annotate("household", { id: membership.householdId, role: membership.role });
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

/** Looks up the household behind a code, counting misses against the user's guess budget */
async function findByInviteCode(userId: string, rawCode: string) {
  const windowStart = Temporal.Now.instant().subtract(INVITE_GUESS_WINDOW);
  const failures = await householdsDal.countFailedInviteAttempts(userId, windowStart);
  annotate("invite", { recent_failed_attempts: failures });
  if (failures >= INVITE_GUESS_LIMIT) throw tooManyInviteAttempts();

  const code = normalizeInviteCode(rawCode);
  const household = code ? await householdsDal.findHouseholdByInviteCode(code) : null;
  annotate("invite", { matched: household !== null });
  if (!household) {
    await householdsDal.recordFailedInviteAttempt(userId, windowStart);
    throw inviteNotFound();
  }
  annotate("invite", { household_id: household.id });
  return household;
}

async function replaceInviteCode(householdId: string, tx: Transaction) {
  for (let attempt = 0; attempt < MAX_INVITE_CODE_ATTEMPTS; attempt++) {
    if (await householdsDal.updateInviteCode(householdId, generateInviteCode(), tx)) return;
  }
  throw new Error("Could not generate a unique invite code");
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

/**
 * Announces, when the transaction commits, that a household's members (or invite code) changed,
 * to everyone in it and to the person who joined or left, whose live stream follows them.
 */
async function membershipChanged(
  target: { householdId?: string; userId?: string },
  tx: Transaction,
): Promise<void> {
  if (target.householdId)
    await announce({ householdId: target.householdId, topic: "household" }, tx);
  if (target.userId) await announce({ userId: target.userId, topic: "household" }, tx);
}
