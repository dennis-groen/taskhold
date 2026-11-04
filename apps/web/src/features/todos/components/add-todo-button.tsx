import { PlusIcon } from "@phosphor-icons/react";

import { Button } from "@/components/ui/button";

import { NewTodoDrawer } from "./new-todo-drawer.tsx";

/** The round + button on the Personal page */
export function AddTodoButton() {
  return (
    <NewTodoDrawer
      trigger={
        <Button aria-label="Add a to-do" variant="fab" size="fab">
          <PlusIcon weight="bold" />
        </Button>
      }
    />
  );
}
