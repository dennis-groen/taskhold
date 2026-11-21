import { useRouter } from "@tanstack/react-router";
import { useState } from "react";

import { ConfirmDialog } from "@/components/ConfirmDialog.tsx";
import { UserMinusIcon } from "@/components/icons.ts";
import { MoreMenu } from "@/components/MoreMenu.tsx";

import { removeMember, type HouseholdMember } from "../households.api.ts";

/** A member's ⋯ menu, for the owner: Remove asks first, then takes them out of the household */
export function RemoveMemberButton({
  member,
  householdName,
}: {
  member: HouseholdMember;
  householdName: string;
}) {
  const router = useRouter();
  const [asking, setAsking] = useState(false);
  const firstName = member.name.trim().split(/\s+/)[0] ?? member.name;

  return (
    <>
      <MoreMenu
        label={`More for ${member.name}`}
        className="-mr-1"
        items={[
          {
            label: `Remove ${firstName}…`,
            icon: UserMinusIcon,
            danger: true,
            onSelect: () => setAsking(true),
          },
        ]}
      />
      <ConfirmDialog
        open={asking}
        onOpenChange={setAsking}
        title={`Remove ${member.name}?`}
        description={`${firstName} loses access to ${householdName} right away. The invite code changes too, so they can't use it to rejoin.`}
        confirmLabel={`Remove ${firstName}`}
        destructive
        onConfirm={async () => {
          await removeMember(member.id);
          await router.invalidate();
        }}
      />
    </>
  );
}
