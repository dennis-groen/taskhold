import { createFileRoute, useNavigate } from "@tanstack/react-router";

import { authClient } from "@/lib/auth-client.ts";

export const Route = createFileRoute("/dashboard")({
  component: DashboardPage,
});

function DashboardPage() {
  const { session } = Route.useRouteContext();
  const navigate = useNavigate();

  async function signOut() {
    await authClient.signOut();
    await navigate({ to: "/" });
  }

  return (
    <div>
      <p>Signed in as {session?.user.email}</p>
      <button type="button" onClick={() => void signOut()}>
        Sign out
      </button>
    </div>
  );
}
