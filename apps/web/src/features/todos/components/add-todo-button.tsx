import { PlusIcon } from "@phosphor-icons/react";

import { Button } from "@/components/ui/button";

import { NewTodoDrawer } from "./new-todo-drawer.tsx";

/** The round + button on the Personal page */
export function AddTodoButton() {
  return (
    <NewTodoDrawer
      trigger={
        <Button
          aria-label="Add a to-do"
          className="size-14 rounded-full shadow-lg shadow-primary/25"
        >
          <PlusIcon className="size-7" weight="bold" />
        </Button>
      }
    />
  );
}
