import { cn } from "cn";

import { SHEET_BODY, SheetContent, SheetHeader } from "@/components/layout/Sheet.tsx";
import { HouseIcon, TrashIcon } from "@/components/icons.ts";
import { Button } from "@/components/ui/button";
import { Drawer, DrawerDescription, DrawerTitle } from "@/components/ui/drawer";

import type { Todo, TodoInput } from "../todos.api.ts";
import { TodoForm } from "./TodoForm.tsx";

/** A to-do's details: change it, move it to the household's chores, or delete it */
export function TodoSheet({
  todo,
  onSave,
  onDelete,
  onMove,
  onClose,
}: {
  /** The to-do to show; null keeps the sheet closed */
  todo: Todo | null;
  onSave: (changes: TodoInput) => void;
  onDelete: () => void;
  /** Makes the to-do a household chore */
  onMove: (todo: Todo) => void;
  onClose: () => void;
}) {
  return (
    <Drawer open={todo !== null} onOpenChange={(open) => !open && onClose()}>
      <SheetContent>
        {todo && (
          <SheetBody
            // Fresh form state for each to-do
            key={todo.id}
            todo={todo}
            onSave={onSave}
            onDelete={onDelete}
            onMove={onMove}
            onClose={onClose}
          />
        )}
      </SheetContent>
    </Drawer>
  );
}

function SheetBody({
  todo,
  onSave,
  onDelete,
  onMove,
  onClose,
}: {
  todo: Todo;
  onSave: (changes: TodoInput) => void;
  onDelete: () => void;
  onMove: (todo: Todo) => void;
  onClose: () => void;
}) {
  return (
    <>
      <SheetHeader>
        <DrawerTitle className="break-words">{todo.name}</DrawerTitle>
        <DrawerDescription>Only you can see this.</DrawerDescription>
      </SheetHeader>

      <div className={cn("overflow-y-auto", SHEET_BODY)}>
        <TodoForm
          initial={{ name: todo.name, notes: todo.notes, dueOn: todo.dueOn }}
          submitLabel="Save changes"
          onSubmit={(input) => {
            onSave(input);
            onClose();
          }}
          footer={
            <div className="flex flex-col gap-2">
              <p className="text-sm text-pretty text-muted-foreground">
                Moving makes it a one-off chore that everyone in your household can see.
                {todo.notes && " Its notes aren't shared: they're deleted with the to-do."}
              </p>
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="xl"
                  className="flex-1"
                  onClick={() => {
                    // Gone from the to-dos straight away, and sent once there is a connection
                    onMove(todo);
                    onClose();
                  }}
                >
                  <HouseIcon />
                  Move to household chores
                </Button>
                <Button
                  type="button"
                  variant="destructive"
                  size="xl"
                  onClick={() => {
                    onDelete();
                    onClose();
                  }}
                >
                  <TrashIcon />
                  Delete
                </Button>
              </div>
            </div>
          }
        />
      </div>
    </>
  );
}
