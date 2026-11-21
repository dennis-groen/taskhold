import { useState } from "react";

import { cn } from "cn";

import {
  SHEET_BODY,
  SHEET_ICON_BUTTON,
  SheetContent,
  SheetEyebrow,
} from "@/components/layout/Sheet.tsx";
import { BroomIcon, CheckIcon, LockIcon, PencilSimpleIcon } from "@/components/icons.ts";
import { Button } from "@/components/ui/button";
import { Drawer, DrawerDescription, DrawerTitle } from "@/components/ui/drawer";
import { daysBetween, rowDueLabel } from "@/lib/dates.ts";

import type { Todo, TodoInput } from "../todos.api.ts";
import { TodoForm } from "./TodoForm.tsx";

/**
 * A to-do, read first: its title and notes, Mark done under the thumb, then moving it to the
 * household's chores or deleting it. The pencil turns the sheet into the form to change it.
 */
export function TodoSheet({
  todo,
  today,
  onSave,
  onDone,
  onDelete,
  onMove,
  onClose,
}: {
  /** The to-do to show; null keeps the sheet closed */
  todo: Todo | null;
  today: string;
  onSave: (changes: TodoInput) => void;
  /** Ticks it, or unticks a done one */
  onDone: (todo: Todo) => void;
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
            // Fresh state for each to-do
            key={todo.id}
            todo={todo}
            today={today}
            onSave={onSave}
            onDone={onDone}
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
  today,
  onSave,
  onDone,
  onDelete,
  onMove,
  onClose,
}: {
  todo: Todo;
  today: string;
  onSave: (changes: TodoInput) => void;
  onDone: (todo: Todo) => void;
  onDelete: () => void;
  onMove: (todo: Todo) => void;
  onClose: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const late = !todo.done && todo.dueOn !== null && daysBetween(today, todo.dueOn) < 0;

  return (
    <>
      <SheetEyebrow
        icon={LockIcon}
        actions={
          !editing && (
            <button
              type="button"
              aria-label={`Change ${todo.name}`}
              onClick={() => setEditing(true)}
              className={SHEET_ICON_BUTTON}
            >
              <PencilSimpleIcon weight="bold" className="size-5" />
            </button>
          )
        }
      >
        {editing ? "Change to-do" : "To-do · only you"}
      </SheetEyebrow>

      {editing ? (
        <div className={cn("overflow-y-auto", SHEET_BODY)}>
          <DrawerTitle className="sr-only">Change {todo.name}</DrawerTitle>
          <DrawerDescription className="sr-only">Only you can see this.</DrawerDescription>
          <TodoForm
            initial={{ name: todo.name, notes: todo.notes, dueOn: todo.dueOn }}
            submitLabel="Save changes"
            onSubmit={(input) => {
              onSave(input);
              setEditing(false);
            }}
          />
        </div>
      ) : (
        <div className={cn("overflow-y-auto", SHEET_BODY, "pt-1")}>
          <DrawerTitle className="text-[2rem] leading-[1.05] break-words">{todo.name}</DrawerTitle>
          <DrawerDescription className={cn("mt-2 text-sm", !todo.dueOn && "sr-only")}>
            {todo.dueOn ? (
              <span
                className={cn("font-[650]", late ? "text-destructive" : "text-muted-foreground")}
              >
                {dueLine(todo.dueOn, today)}
              </span>
            ) : (
              "Only you can see this."
            )}
          </DrawerDescription>
          {todo.notes && (
            <p className="mt-4 rounded-2xl bg-muted px-4 py-3 text-[0.9375rem] whitespace-pre-wrap">
              {todo.notes}
            </p>
          )}

          <Button
            size="xl"
            className="mt-5 h-16 w-full rounded-2xl text-[1.0625rem] font-[750]"
            onClick={() => {
              onDone(todo);
              onClose();
            }}
          >
            <CheckIcon weight="bold" aria-hidden className="size-5" />
            {todo.done ? "Mark not done" : "Mark done"}
          </Button>

          <Button
            variant="secondary"
            size="xl"
            className="mt-2 w-full rounded-2xl"
            onClick={() => {
              // Gone from the to-dos straight away, and sent once there is a connection
              onMove(todo);
              onClose();
            }}
          >
            <BroomIcon aria-hidden />
            Move to chores
          </Button>
          <p className="mt-2 px-1 text-[0.8125rem] text-pretty text-muted-foreground">
            It becomes a one-off chore for anyone in the household.
            {todo.notes && " Notes aren't shared: they're deleted with the to-do."}
          </p>

          <Button
            variant="ghost"
            size="xl"
            className="mt-4 w-full rounded-2xl text-destructive hover:text-destructive"
            onClick={() => {
              onDelete();
              onClose();
            }}
          >
            Delete to-do
          </Button>
        </div>
      )}
    </>
  );
}

/** "Due today", "Due tomorrow", "Due Sat 21 Nov", "Was due yesterday", "3 days late" */
function dueLine(dueOn: string, today: string): string {
  const label = rowDueLabel(dueOn, today);
  if (label === null) return "Due today";
  if (label === "Yesterday") return "Was due yesterday";
  if (label === "Tomorrow") return "Due tomorrow";
  return daysBetween(today, dueOn) < 0 ? label : `Due ${label}`;
}
