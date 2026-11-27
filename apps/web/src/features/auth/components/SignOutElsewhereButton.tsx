import { ConfirmDialog } from "@/components/ConfirmDialog.tsx";
import { DevicesIcon } from "@/components/icons.ts";
import { SettingButton } from "@/components/layout/SettingRow.tsx";
import { notify } from "@/lib/feedback.ts";

import { signOutElsewhere } from "../auth.api.ts";

/** For a lost phone: ends every session of the person except this one */
export function SignOutElsewhereButton() {
  return (
    <ConfirmDialog
      trigger={
        <SettingButton
          icon={DevicesIcon}
          tone="plain"
          title="Sign out of other devices"
          sub="For a lost or old phone. This one stays signed in."
        />
      }
      title="Sign out of your other devices?"
      description="Every other phone, tablet and browser signed in as you is signed out. This one stays signed in."
      confirmLabel="Sign out the others"
      onConfirm={async () => {
        const ended = await signOutElsewhere();
        notify(
          ended === 0
            ? "You weren't signed in anywhere else"
            : `Signed out of ${ended === 1 ? "1 other device" : `${ended} other devices`}`,
        );
      }}
    />
  );
}
