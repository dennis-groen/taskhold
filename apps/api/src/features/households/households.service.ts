// Business rules for households: who can create, join, manage and see what.
// Talks to the repo only, throws AppErrors, and knows nothing about HTTP.
//
// Every change to who is in a household runs in a transaction that locks the household row,
// so concurrent joins, leaves and removals in one household happen one at a time.
import { transaction, type Executor, type Transaction } from "../../db/db.ts";
import { announce } from "../live/live-changes.ts";
import { oneAtATime } from "../../lib/one-at-a-time.ts";
import { annotate } from "../../lib/wide-event.ts";
import * as authService from "../auth/auth.service.ts";
import * as householdsRepo from "./households.repo.ts";
import {
  alreadyInHousehold,
  cannotRemoveSelf,
  inviteNotFound,
  memberNotFound,
  notInHousehold,
  ownerOnly,
  tooManyInviteAttempts,
} from "./households.errors.ts";
import type {
  CreateHouseholdInput,
  Household,
  InvitePreview,
  Membership,
} from "./households.schema.ts";
import { generateInviteCode, normalizeInviteCode } from "./invite-code.ts";

const MAX_INVITE_CODE_ATTEMPTS = 5;

// An invite code is the only thing needed to join a household, so each account gets a small
// budget of codes that match nothing. With 40-bit codes this makes guessing any household's code
// take far longer than an account is worth.
const INVITE_GUESS_LIMIT = 10;
const INVITE_GUESS_WINDOW = Temporal.Duration.from({ minutes: 15 });

/**
 * The household a user belongs to, or null when they haven't created or joined one. Callers inside
 * a transaction pass it, so they don't wait on the pool for a second connection.
 */
export async function findMembership(
  userId: string,
  executor?: Executor,
): Promise<Membership | null> {
  const membership = await householdsRepo.findMembershipByUserId(userId, executor);
  if (!membership) return null;
  annotate("household", { id: membership.householdId, role: membership.role });
  return { id: membership.householdId, name: membership.householdName, role: membership.role };
}

/** Like findMembership, for features that only work inside a household */
export async function getMembershipOf(userId: string, executor?: Executor): Promise<Membership> {
  const membership = await findMembership(userId, executor);
  if (!membership) throw notInHousehold();
  return membership;
}

/** Whether someone is in this household right now, e.g. before assigning them something */
export function isMemberOf(
  householdId: string,
  userId: string,
  executor?: Executor,
): Promise<boolean> {
  return householdsRepo.isMember({ householdId, userId }, executor);
}

export async function getHouseholdOf(userId: string): Promise<Household> {
  const membership = await householdsRepo.findMembershipByUserId(userId);
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
    const added = await householdsRepo.insertMember(
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
    const locked = await householdsRepo.lockHousehold(household.id, tx);
    if (!locked || locked.inviteCode !== household.inviteCode) throw inviteNotFound();

    const added = await householdsRepo.insertMember(
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
 * earliest takes over; if they were the last one, the household is deleted. The household gets
 * a new invite code, as when someone is removed.
 */
export async function leaveHousehold(userId: string): Promise<{ householdDeleted: boolean }> {
  return transaction((tx) => leave(userId, tx));
}

/**
 * For deleting an account: leaves the user's household the same way, in the caller's
 * transaction, and does nothing when they aren't in one
 */
export async function leaveAnyHousehold(userId: string, tx: Transaction): Promise<void> {
  if (await householdsRepo.findMembershipByUserId(userId, tx)) await leave(userId, tx);
}

async function leave(userId: string, tx: Transaction): Promise<{ householdDeleted: boolean }> {
  const membership = await lockMembershipOf(userId, tx);
  const { householdId } = membership;
  await householdsRepo.deleteMember({ householdId, userId }, tx);
  await membershipChanged({ householdId, userId }, tx);

  const successor = await householdsRepo.findEarliestMember(householdId, tx);
  if (!successor) {
    await householdsRepo.deleteHousehold(householdId, tx);
    annotate("household", { deleted: true });
    return { householdDeleted: true };
  }
  // Every member can see the invite code, so the person who left would still know how to rejoin
  await replaceInviteCode(householdId, tx);
  if (membership.role === "owner") {
    await householdsRepo.setMemberRole(
      { householdId, userId: successor.userId, role: "owner" },
      tx,
    );
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
    const removed = await householdsRepo.deleteMember(
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
  const before = await householdsRepo.findMembershipByUserId(userId, tx);
  if (!before) throw notInHousehold();

  await householdsRepo.lockHousehold(before.householdId, tx);
  const membership = await householdsRepo.findMembershipByUserId(userId, tx);
  if (!membership || membership.householdId !== before.householdId) throw notInHousehold();
  annotate("household", { id: membership.householdId, role: membership.role });
  if (options.ownerOnly && membership.role !== "owner") throw ownerOnly();
  return membership;
}

async function getHousehold(householdId: string): Promise<Household> {
  const household = await householdsRepo.findHouseholdById(householdId);
  // Callers only pass ids they just read or wrote, so a miss means the data changed underneath us
  if (!household) throw new Error(`Household ${householdId} not found`);

  return {
    id: household.id,
    name: household.name,
    inviteCode: household.inviteCode,
    members: household.members.map(({ userId, ...member }) => ({ id: userId, ...member })),
  };
}

/**
 * Looks up the household behind a code, counting misses against the person's guess budget. The
 * budget belongs to their sign-in identity, so a new account for the same Google login doesn't get
 * a fresh one, and their lookups run one at a time, so a burst of guesses can't all pass the check:
 * queued in this process first, so waiting lookups don't hold database connections, then under a
 * database lock for lookups on other API instances.
 */
async function findByInviteCode(userId: string, rawCode: string) {
  const identity = await authService.signInIdentityOf(userId);
  const lookUp = () =>
    transaction(async (tx) => {
      await householdsRepo.lockInviteAttempts(identity, tx);
      const windowStart = Temporal.Now.instant().subtract(INVITE_GUESS_WINDOW);
      const failures = await householdsRepo.countFailedInviteAttempts(identity, windowStart, tx);
      annotate("invite", { recent_failed_attempts: failures });
      if (failures >= INVITE_GUESS_LIMIT) throw tooManyInviteAttempts();

      const code = normalizeInviteCode(rawCode);
      const found = code ? await householdsRepo.findHouseholdByInviteCode(code, tx) : null;
      annotate("invite", { matched: found !== null });
      // Recorded, not thrown, so the miss commits
      if (!found) await householdsRepo.recordFailedInviteAttempt(identity, windowStart, tx);
      return { household: found, missed: !found };
    });
  const { household, missed } = await oneAtATime(`invite:${identity}`, lookUp);
  if (missed || !household) throw inviteNotFound();
  annotate("invite", { household_id: household.id });
  return household;
}

async function replaceInviteCode(householdId: string, tx: Transaction) {
  for (let attempt = 0; attempt < MAX_INVITE_CODE_ATTEMPTS; attempt++) {
    if (await householdsRepo.updateInviteCode(householdId, generateInviteCode(), tx)) return;
  }
  throw new Error("Could not generate a unique invite code");
}

async function insertWithFreshInviteCode(name: string, tx: Transaction) {
  for (let attempt = 0; attempt < MAX_INVITE_CODE_ATTEMPTS; attempt++) {
    const created = await householdsRepo.insertHousehold(
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
