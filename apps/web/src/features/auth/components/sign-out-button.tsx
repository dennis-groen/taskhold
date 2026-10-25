import { useNavigate } from "@tanstack/react-router";

import { Button } from "@/components/ui/button";

import { authClient } from "../auth-client.ts";

export function SignOutButton() {
  const navigate = useNavigate();

  async function signOut() {
    await authClient.signOut();
    await navigate({ to: "/" });
  }

  return (
    <Button variant="ghost" size="sm" onClick={() => void signOut()}>
      Sign out
    </Button>
  );
}
