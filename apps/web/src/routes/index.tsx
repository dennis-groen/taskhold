import { Link, createFileRoute } from "@tanstack/react-router";

import { authClient } from "@/lib/auth-client.ts";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/")({
  component: LandingPage,
});

function LandingPage() {
  const { session } = Route.useRouteContext();

  if (session) {
    return <Link to="/dashboard">Go to dashboard</Link>;
  }

  return (
    <Button
      type="button"
      onClick={() =>
        void authClient.signIn.social({ provider: "google", callbackURL: "/dashboard" })
      }
    >
      Login with Google
    </Button>
  );
}
