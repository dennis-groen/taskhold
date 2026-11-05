import { useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";

import { Button } from "@/components/ui/button";
import { forgetOfflineCache } from "@/lib/offline-cache.ts";
import { forgetPushDevice } from "@/lib/push-device.ts";

import { authClient } from "./auth-client.ts";

export function SignOutButton() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  async function signOut() {
    // The next person to sign in here shouldn't get this person's reminders
    await forgetPushDevice();
    await authClient.signOut();
    // Nor their lists and to-dos, in memory or kept on the device
    forgetOfflineCache(queryClient);
    await navigate({ to: "/" });
  }

  return (
    <Button variant="ghost" size="sm" onClick={() => void signOut()}>
      Sign out
    </Button>
  );
}
