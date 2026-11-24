import { useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { useState } from "react";

import { SignOutIcon } from "@/components/icons.ts";
import { SettingButton } from "@/components/layout/SettingRow.tsx";
import { forgetOfflineCache } from "@/lib/offline-cache.ts";
import { forgetPushDevice } from "@/lib/push-device.ts";

import { authClient } from "../auth-client.ts";

/** A settings row: signs out here, and forgets this person's data on the device */
export function SignOutButton() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  // One tap is enough; a second while it runs would sign out twice
  const [signingOut, setSigningOut] = useState(false);

  async function signOut() {
    setSigningOut(true);
    try {
      // The next person to sign in here shouldn't get this person's reminders
      await forgetPushDevice();
      await authClient.signOut();
      // Nor their lists and to-dos, in memory or kept on the device
      forgetOfflineCache(queryClient);
      await navigate({ to: "/" });
    } finally {
      setSigningOut(false);
    }
  }

  return (
    <SettingButton
      icon={SignOutIcon}
      tone="plain"
      title="Sign out"
      sub={signingOut ? "Signing out…" : "Just this device"}
      disabled={signingOut}
      onClick={() => void signOut()}
    />
  );
}
