import { createFileRoute, redirect } from "@tanstack/react-router";

import { SignInPage } from "@/features/auth/SignInPage.tsx";
import { safeRedirect } from "@/features/auth/redirect.ts";

export const Route = createFileRoute("/")({
  validateSearch: (search): { redirect?: string } => ({ redirect: safeRedirect(search.redirect) }),
  // Signed-in people have nothing to do here; send them on to where they were going
  beforeLoad: ({ context, search }) => {
    if (context.viewer.user) throw redirect({ href: search.redirect ?? "/lists", replace: true });
  },
  component: SignInPage,
});
