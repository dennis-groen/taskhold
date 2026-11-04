import { PlusIcon } from "@phosphor-icons/react";

import { Button } from "@/components/ui/button";

import type { Member } from "./chore-form.tsx";
import { NewChoreDrawer } from "./new-chore-drawer.tsx";

/** The round + button on the chores page */
export function AddChoreButton({ members, viewerId }: { members: Member[]; viewerId: string }) {
  return (
    <NewChoreDrawer
      members={members}
      viewerId={viewerId}
      trigger={
        <Button aria-label="Add a chore" variant="fab" size="fab">
          <PlusIcon weight="bold" />
        </Button>
      }
    />
  );
}
