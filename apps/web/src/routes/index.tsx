import { createFileRoute } from "@tanstack/react-router";

import { SignInPage } from "@/features/auth/pages/sign-in-page.tsx";
import { safeRedirect } from "@/features/auth/redirect.ts";

export const Route = createFileRoute("/")({
  validateSearch: (search): { redirect?: string } => ({ redirect: safeRedirect(search.redirect) }),
  component: SignInPage,
});
