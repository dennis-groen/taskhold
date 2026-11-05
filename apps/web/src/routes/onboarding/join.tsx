import { createFileRoute } from "@tanstack/react-router";

import { lookUpInvite, type InviteLookup } from "@/features/households/households.api.ts";
import { INVITE_CODE_LENGTH, extractInviteCode } from "@/features/households/invite-code.ts";
import { JoinHouseholdPage } from "@/features/households/components/JoinHouseholdPage.tsx";

export const Route = createFileRoute("/onboarding/join")({
  validateSearch: (search): { code?: string } => ({
    code: typeof search.code === "string" ? extractInviteCode(search.code) || undefined : undefined,
  }),
  // A code that came in through an invite link is looked up before the page shows
  loaderDeps: ({ search }) => ({ code: search.code }),
  loader: ({ deps }): Promise<InviteLookup> | InviteLookup =>
    deps.code?.length === INVITE_CODE_LENGTH ? lookUpInvite(deps.code) : { status: "idle" },
  component: JoinHouseholdPage,
});
