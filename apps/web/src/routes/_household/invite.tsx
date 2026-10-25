import { createFileRoute } from "@tanstack/react-router";

import { InviteMembersPage } from "@/features/households/pages/invite-members-page.tsx";

export const Route = createFileRoute("/_household/invite")({
  // `created` is set right after someone makes a new household
  validateSearch: (search): { created?: boolean } => ({
    created: search.created === true ? true : undefined,
  }),
  component: InviteMembersPage,
});
