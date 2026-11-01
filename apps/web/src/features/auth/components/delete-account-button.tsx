import { TrashIcon } from "@phosphor-icons/react";
import { useNavigate } from "@tanstack/react-router";

import { ConfirmDialog } from "@/components/confirm-dialog.tsx";
import { Button } from "@/components/ui/button";
import { queryClient } from "@/router.tsx";

import { deleteAccount } from "../auth.api.ts";

type HouseholdSummary = {
  name: string;
  /** Oldest first, the order the API uses to pick the next owner */
  members: { id: string; name: string; role: "owner" | "member" }[];
};

export function DeleteAccountButton({
  household,
  currentUserId,
}: {
  /** Null when the person isn't in a household */
  household: HouseholdSummary | null;
  currentUserId: string;
}) {
  const navigate = useNavigate();

  return (
    <ConfirmDialog
      trigger={
        <Button variant="ghost" size="lg" className="h-11 px-4 text-destructive">
          <TrashIcon />
          Delete account
        </Button>
      }
      title="Delete your account?"
      description={`${consequences(household, currentUserId)} This can't be undone.`}
      confirmLabel="Delete account"
      destructive
      onConfirm={async () => {
        await deleteAccount();
        // Nothing from the deleted account should be on screen or in memory afterwards
        queryClient.clear();
        await navigate({ to: "/" });
      }}
    />
  );
}

function consequences(household: HouseholdSummary | null, currentUserId: string): string {
  if (!household) return "This deletes your account and your private to-dos.";

  const me = household.members.find((member) => member.id === currentUserId);
  const successor = household.members.find((member) => member.id !== currentUserId);
  if (!successor) {
    return `This deletes your account, your private to-dos, and ${household.name} with its lists and chores.`;
  }
  const handover = me?.role === "owner" ? ` ${successor.name} becomes the owner.` : "";
  return `This deletes your account and your private to-dos. Lists and chores stay in ${household.name} without your name on them.${handover}`;
}
