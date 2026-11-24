import { useNavigate } from "@tanstack/react-router";

import { ConfirmDialog } from "@/components/ConfirmDialog.tsx";
import { DoorOpenIcon } from "@/components/icons.ts";
import { SettingButton } from "@/components/layout/SettingRow.tsx";
import { notify } from "@/lib/feedback.ts";
import { firstName } from "@/lib/shared-with.ts";

import { leaveHousehold, type Household } from "../households.api.ts";

/** The Household page's last row: asks, then takes the person out and back to onboarding */
export function LeaveHouseholdButton({
  household,
  currentUserId,
}: {
  household: Household;
  currentUserId: string;
}) {
  const navigate = useNavigate();
  const me = household.members.find((member) => member.id === currentUserId);
  // Members come oldest first, the same order the API uses to pick the next owner
  const successor = household.members.find((member) => member.id !== currentUserId);

  const copy = !successor
    ? {
        title: `Leave and delete ${household.name}?`,
        description: `You're the only one here, so leaving deletes ${household.name} and its invite code. This can't be undone.`,
        confirmLabel: "Leave and delete",
        sub: "You're the only one here, so this deletes it",
      }
    : {
        title: `Leave ${household.name}?`,
        description:
          me?.role === "owner"
            ? `${successor.name} becomes the owner. You can only come back with an invite code.`
            : "You can only come back with an invite code.",
        confirmLabel: "Leave household",
        sub:
          me?.role === "owner"
            ? `${firstName(successor.name)} becomes the owner`
            : "You can come back with an invite code",
      };

  return (
    <ConfirmDialog
      trigger={
        <SettingButton
          icon={DoorOpenIcon}
          tone="danger"
          title={`Leave ${household.name}`}
          sub={copy.sub}
        />
      }
      title={copy.title}
      description={copy.description}
      confirmLabel={copy.confirmLabel}
      destructive
      onConfirm={async () => {
        await leaveHousehold();
        await navigate({ to: "/onboarding" });
        notify(successor ? `You left ${household.name}` : `${household.name} deleted`);
      }}
    />
  );
}
