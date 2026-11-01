import { HouseIcon, TrashIcon } from "@phosphor-icons/react";
import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";
import { Spinner } from "@/components/ui/spinner";
import { errorMessage } from "@/lib/api-client.ts";

import { moveToChores, type Todo, type TodoInput } from "../todos.api.ts";
import { todoKeys } from "../todos.queries.ts";
import { TodoForm } from "./todo-form.tsx";

/** A to-do's details: change it, move it to the household's chores, or delete it */
export function TodoSheet({
  todo,
  onSave,
  onDelete,
  onMoved,
  onClose,
}: {
  /** The to-do to show; null keeps the sheet closed */
  todo: Todo | null;
  onSave: (changes: TodoInput) => Promise<unknown>;
  onDelete: () => void;
  /** After the to-do became a household chore */
  onMoved: (name: string) => void;
  onClose: () => void;
}) {
  return (
    <Drawer open={todo !== null} onOpenChange={(open) => !open && onClose()}>
      <DrawerContent className="mx-auto max-w-[640px]">
        {todo && (
          <SheetBody
            // Fresh form state for each to-do
            key={todo.id}
            todo={todo}
            onSave={onSave}
            onDelete={onDelete}
            onMoved={onMoved}
            onClose={onClose}
          />
        )}
      </DrawerContent>
    </Drawer>
  );
}

function SheetBody({
  todo,
  onSave,
  onDelete,
  onMoved,
  onClose,
}: {
  todo: Todo;
  onSave: (changes: TodoInput) => Promise<unknown>;
  onDelete: () => void;
  onMoved: (name: string) => void;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const [moving, setMoving] = useState(false);
  const [moveError, setMoveError] = useState<string | null>(null);

  async function move() {
    setMoving(true);
    setMoveError(null);
    try {
      await moveToChores(todo.id);
      await queryClient.invalidateQueries({ queryKey: todoKeys.all });
      onMoved(todo.name);
      onClose();
    } catch (err) {
      setMoveError(errorMessage(err, "Couldn't move it to chores. Try again."));
    } finally {
      setMoving(false);
    }
  }

  return (
    <>
      <DrawerHeader className="px-5 pt-5 text-left">
        <DrawerTitle className="text-lg font-semibold break-words">{todo.name}</DrawerTitle>
        <DrawerDescription>Only you can see this.</DrawerDescription>
      </DrawerHeader>

      <div className="overflow-y-auto px-5 pt-4 pb-[calc(1.25rem+env(safe-area-inset-bottom))]">
        <TodoForm
          initial={{ name: todo.name, notes: todo.notes, dueOn: todo.dueOn }}
          submitLabel="Save changes"
          onSubmit={async (input) => {
            await onSave(input);
            onClose();
          }}
          footer={
            <div className="flex flex-col gap-2">
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  variant="outline"
                  disabled={moving}
                  className="h-12 flex-1 px-4"
                  onClick={() => void move()}
                >
                  {moving ? <Spinner /> : <HouseIcon />}
                  Move to household chores
                </Button>
                <Button
                  type="button"
                  variant="destructive"
                  className="h-12 px-4"
                  onClick={() => {
                    onDelete();
                    onClose();
                  }}
                >
                  <TrashIcon />
                  Delete
                </Button>
              </div>
              <p className="text-sm text-muted-foreground">
                Moving makes it a one-off chore that everyone in your household can see.
                {todo.notes && " Its notes aren't shared: they're deleted with the to-do."}
              </p>
              {moveError && (
                <p role="alert" className="text-sm text-destructive">
                  {moveError}
                </p>
              )}
            </div>
          }
        />
      </div>
    </>
  );
}
