import { createFileRoute, redirect } from "@tanstack/react-router";

import { InviteMembersPage } from "@/features/households/components/InviteMembersPage.tsx";

export const Route = createFileRoute("/_household/invite")({
  // `created` is set right after someone makes a new household
  validateSearch: (search): { created?: boolean } => ({
    created: search.created === true ? true : undefined,
  }),
  // A demo household can't be joined, so there's nothing to share
  beforeLoad: ({ context }) => {
    if (context.demoEndsAt) throw redirect({ to: "/household" });
  },
  component: InviteMembersPage,
});
