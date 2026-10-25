import { Link, createFileRoute } from "@tanstack/react-router";

import { authClient } from "@/lib/auth-client.ts";
import { Button } from "@/components/ui/button";

// Only same-site paths, so a crafted link can't send people elsewhere after sign-in
function safeRedirect(value: unknown) {
  return typeof value === "string" && value.startsWith("/") && !value.startsWith("//")
    ? value
    : undefined;
}

export const Route = createFileRoute("/")({
  validateSearch: (search): { redirect?: string } => ({ redirect: safeRedirect(search.redirect) }),
  component: LandingPage,
});

function LandingPage() {
  const { viewer } = Route.useRouteContext();
  const { redirect } = Route.useSearch();

  if (viewer.user) {
    return <Link to="/dashboard">Go to dashboard</Link>;
  }

  return (
    <Button
      type="button"
      onClick={() =>
        void authClient.signIn.social({
          provider: "google",
          // Back to the page that asked for sign-in, e.g. an invite link
          callbackURL: redirect ?? "/dashboard",
        })
      }
    >
      Login with Google
    </Button>
  );
}
