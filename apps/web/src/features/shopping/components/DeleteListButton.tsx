import { useNavigate } from "@tanstack/react-router";

import { ConfirmDialog } from "@/components/ConfirmDialog.tsx";
import { TrashIcon } from "@/components/icons.ts";
import { Button } from "@/components/ui/button";

import type { ShoppingList } from "../shopping.api.ts";
import { useManageLists } from "../shopping.hooks.ts";

export function DeleteListButton({ list }: { list: ShoppingList }) {
  const navigate = useNavigate();
  const { remove } = useManageLists();
  const count = list.items.length;

  return (
    <ConfirmDialog
      trigger={
        <Button variant="destructive-ghost" size="lg">
          <TrashIcon />
          Delete list
        </Button>
      }
      title={`Delete ${list.name}?`}
      description={
        count === 0
          ? "The list goes away for everyone in your household."
          : `The list and its ${count === 1 ? "item" : `${count} items`} go away for everyone in your household.`
      }
      confirmLabel="Delete list"
      destructive
      onConfirm={async () => {
        // Leave first, so the open list doesn't look for something that's gone. Gone from the
        // overview straight away, and sent once there is a connection.
        await navigate({ to: "/lists" });
        remove(list.id);
      }}
    />
  );
}
