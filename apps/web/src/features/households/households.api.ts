import { api, errorMessage, parseResponse, type InferResponseType } from "@/lib/api-client.ts";

const households = api.households;

export type Household = InferResponseType<typeof households.current.$get, 200>["household"];
export type HouseholdMember = Household["members"][number];
export type InvitePreview = InferResponseType<
  (typeof households.invites)[":code"]["$get"],
  200
>["invite"];

export async function fetchCurrentHousehold(): Promise<Household> {
  return (await parseResponse(households.current.$get())).household;
}

/**
 * The household as kept on the device, so shopping, chores and to-dos can open without a
 * connection: its name and who is in it. Never the invite code. Pages that need more (the
 * household and invite pages) say they need a connection instead.
 */
export type SavedHousehold = {
  id: string;
  name: string;
  members: { id: string; name: string; image: null }[];
  offline: true;
};

/** What's kept on the device of a household loaded from the API */
export function householdSummary(household: Household): Omit<SavedHousehold, "offline"> {
  return {
    id: household.id,
    name: household.name,
    // Pictures wouldn't load offline anyway; faces show initials instead
    members: household.members.map(({ id, name }) => ({ id, name, image: null })),
  };
}

/** True for a household from the device, opened without a connection */
export function isSavedHousehold(
  household: Household | SavedHousehold,
): household is SavedHousehold {
  return "offline" in household;
}

export async function createHousehold(name: string): Promise<Household> {
  return (await parseResponse(households.$post({ json: { name } }))).household;
}

export async function acceptInvite(code: string): Promise<Household> {
  return (await parseResponse(households.invites[":code"].accept.$post({ param: { code } })))
    .household;
}

export type InviteLookup =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "found"; invite: InvitePreview }
  | { status: "error"; message: string };

/** Looks up an invite code without throwing, so the result can go straight into UI state */
export async function lookUpInvite(code: string): Promise<InviteLookup> {
  try {
    const { invite } = await parseResponse(households.invites[":code"].$get({ param: { code } }));
    return { status: "found", invite };
  } catch (err) {
    return { status: "error", message: errorMessage(err, "Couldn't check this code. Try again.") };
  }
}

/** Leaves the household. If you were the last member, the household is deleted. */
export async function leaveHousehold(): Promise<{ householdDeleted: boolean }> {
  return parseResponse(households.current.leave.$post());
}

/** Owner only: replaces the invite code, so the old code and link stop working */
export async function regenerateInviteCode(): Promise<Household> {
  return (await parseResponse(households.current["invite-code"].$post())).household;
}

/** Owner only */
export async function removeMember(userId: string): Promise<Household> {
  return (await parseResponse(households.current.members[":userId"].$delete({ param: { userId } })))
    .household;
}
