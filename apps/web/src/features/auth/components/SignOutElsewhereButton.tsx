import { toast } from "sonner";

import { ConfirmDialog } from "@/components/ConfirmDialog.tsx";
import { Button } from "@/components/ui/button";

import { signOutElsewhere } from "../auth.api.ts";

/** For a lost phone: ends every session of the person except this one */
export function SignOutElsewhereButton() {
  return (
    <ConfirmDialog
      trigger={
        <Button variant="ghost" size="lg">
          Sign out of other devices
        </Button>
      }
      title="Sign out of your other devices?"
      description="Every other phone, tablet and browser signed in as you is signed out. This one stays signed in."
      confirmLabel="Sign out the others"
      onConfirm={async () => {
        const ended = await signOutElsewhere();
        toast(
          ended === 0
            ? "You weren't signed in anywhere else"
            : `Signed out of ${ended === 1 ? "1 other device" : `${ended} other devices`}`,
        );
      }}
    />
  );
}
