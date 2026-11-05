import { useRouter } from "@tanstack/react-router";

import { ConfirmDialog } from "@/components/ConfirmDialog.tsx";
import { ArrowsClockwiseIcon } from "@/components/icons.ts";
import { Button } from "@/components/ui/button";

import { regenerateInviteCode } from "../households.api.ts";

export function NewInviteCodeButton({ onReplaced }: { onReplaced: () => void }) {
  const router = useRouter();

  return (
    <ConfirmDialog
      trigger={
        <Button variant="ghost" size="sm" className="-ml-2 text-muted-foreground">
          <ArrowsClockwiseIcon />
          Get a new code
        </Button>
      }
      title="Get a new invite code?"
      description="The current code and link stop working right away. Anyone who hasn't joined yet needs the new one."
      confirmLabel="Get new code"
      onConfirm={async () => {
        await regenerateInviteCode();
        await router.invalidate();
        onReplaced();
      }}
    />
  );
}
