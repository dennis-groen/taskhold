import { useNavigate } from "@tanstack/react-router";

import { ConfirmDialog } from "@/components/ConfirmDialog.tsx";
import { SignOutIcon } from "@/components/icons.ts";
import { SettingButton } from "@/components/layout/SettingRow.tsx";
import { notify } from "@/lib/feedback.ts";

import { endDemo } from "../demo.api.ts";

/** In place of Leave and Delete account in the demo: deletes it now and goes back to sign-in */
export function EndDemoButton() {
  const navigate = useNavigate();
  return (
    <ConfirmDialog
      trigger={
        <SettingButton
          icon={SignOutIcon}
          tone="danger"
          title="End the demo"
          sub="Deletes this demo household now"
        />
      }
      title="End the demo?"
      description="The demo household, its lists, chores and to-dos are deleted now. You can start a fresh one from the sign-in page."
      confirmLabel="End demo"
      destructive
      onConfirm={async () => {
        await endDemo();
        await navigate({ to: "/" });
        notify("Demo ended", "Thanks for trying taskhold.");
      }}
    />
  );
}
