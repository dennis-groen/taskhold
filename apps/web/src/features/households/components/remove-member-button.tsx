import { useRouter } from "@tanstack/react-router";

import { ConfirmDialog } from "@/components/confirm-dialog.tsx";
import { Button } from "@/components/ui/button";

import { removeMember, type HouseholdMember } from "../households.api.ts";

export function RemoveMemberButton({
  member,
  householdName,
}: {
  member: HouseholdMember;
  householdName: string;
}) {
  const router = useRouter();
  const firstName = member.name.trim().split(/\s+/)[0] ?? member.name;

  return (
    <ConfirmDialog
      trigger={
        <Button
          variant="ghost"
          size="sm"
          aria-label={`Remove ${member.name}`}
          className="-mr-2 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
        >
          Remove
        </Button>
      }
      title={`Remove ${member.name}?`}
      description={`${firstName} loses access to ${householdName} right away. The invite code changes too, so they can't use it to rejoin.`}
      confirmLabel={`Remove ${firstName}`}
      destructive
      onConfirm={async () => {
        await removeMember(member.id);
        await router.invalidate();
      }}
    />
  );
}
