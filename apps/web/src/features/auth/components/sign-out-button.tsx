import { useNavigate } from "@tanstack/react-router";

import { Button } from "@/components/ui/button";
import { forgetPushDevice } from "@/lib/push-device.ts";

import { authClient } from "../auth-client.ts";

export function SignOutButton() {
  const navigate = useNavigate();

  async function signOut() {
    // The next person to sign in here shouldn't get this person's reminders
    await forgetPushDevice();
    await authClient.signOut();
    await navigate({ to: "/" });
  }

  return (
    <Button variant="ghost" size="sm" onClick={() => void signOut()}>
      Sign out
    </Button>
  );
}
