import { useNavigate } from "@tanstack/react-router";

import { ConfirmDialog } from "@/components/ConfirmDialog.tsx";
import { SignOutIcon } from "@/components/icons.ts";
import { Button } from "@/components/ui/button";

import { leaveHousehold, type Household } from "../households.api.ts";

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
      }
    : {
        title: `Leave ${household.name}?`,
        description:
          me?.role === "owner"
            ? `${successor.name} becomes the owner. You can only come back with an invite code.`
            : "You can only come back with an invite code.",
        confirmLabel: "Leave household",
      };

  return (
    <ConfirmDialog
      trigger={
        <Button variant="outline" size="lg">
          <SignOutIcon />
          Leave household
        </Button>
      }
      {...copy}
      destructive
      onConfirm={async () => {
        await leaveHousehold();
        await navigate({ to: "/onboarding" });
      }}
    />
  );
}
