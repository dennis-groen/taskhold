import type { HouseholdRole } from "./households.schema.ts";

// Shapes the households feature returns to clients

export type HouseholdMember = {
  id: string;
  name: string;
  image: string | null;
  role: HouseholdRole;
  joinedAt: Temporal.Instant;
};

export type Household = {
  id: string;
  name: string;
  inviteCode: string;
  members: HouseholdMember[];
};

export type Membership = {
  id: string;
  name: string;
  role: HouseholdRole;
};

/** What someone holding an invite code may see before joining: no emails, no code */
export type InvitePreview = {
  householdName: string;
  members: { name: string; image: string | null }[];
};
