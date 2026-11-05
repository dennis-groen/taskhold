import { TrashIcon } from "@phosphor-icons/react";
import { useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";

import { ConfirmDialog } from "@/components/ConfirmDialog.tsx";
import { Button } from "@/components/ui/button";

import { deleteList, type ShoppingList } from "../shopping.api.ts";
import { shoppingKeys } from "../shopping.queries.ts";

export function DeleteListButton({ list }: { list: ShoppingList }) {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
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
        await deleteList(list.id);
        // Leave first, so the open list doesn't poll for something that's gone
        await navigate({ to: "/lists" });
        queryClient.removeQueries({ queryKey: shoppingKeys.list(list.id) });
        await queryClient.invalidateQueries({ queryKey: shoppingKeys.lists() });
      }}
    />
  );
}
