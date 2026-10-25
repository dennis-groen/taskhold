import { createFileRoute, redirect } from "@tanstack/react-router";

import { extractInviteCode } from "@/features/households/invite-code.ts";

// Shareable invite link: /join/FQVH-79ZK opens the join screen with the code filled in.
// Signed-out visitors are sent to sign in first and come back here afterwards.
export const Route = createFileRoute("/join/$code")({
  beforeLoad: ({ params }) => {
    throw redirect({ to: "/onboarding/join", search: { code: extractInviteCode(params.code) } });
  },
});
