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
