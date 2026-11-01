import { NoteIcon } from "@phosphor-icons/react";
import { useId } from "react";

import { Checkbox } from "@/components/ui/checkbox";
import { daysBetween, dueLabel } from "@/lib/dates.ts";
import { cn } from "@/lib/utils";

import type { Todo } from "../todos.api.ts";

/** One to-do: tick the circle to mark it done, tap the rest to see and change it */
export function TodoRow({
  todo,
  today,
  onDone,
  onOpen,
}: {
  todo: Todo;
  today: string;
  onDone: (done: boolean) => void;
  onOpen: () => void;
}) {
  const nameId = useId();
  const overdue = !todo.done && todo.dueOn !== null && daysBetween(today, todo.dueOn) < 0;

  return (
    <li className="flex min-h-13 items-stretch">
      <span className="flex items-center py-3 pr-1 pl-4">
        <Checkbox
          aria-labelledby={nameId}
          checked={todo.done}
          onCheckedChange={(checked) => onDone(checked)}
          className="size-6 rounded-full [&_svg]:size-4"
        />
      </span>
      <button
        type="button"
        onClick={onOpen}
        className="flex min-w-0 flex-1 items-center gap-3 py-3 pr-4 pl-2 text-left outline-none hover:bg-muted/50 focus-visible:bg-muted/50"
      >
        <span className="min-w-0 flex-1">
          <span
            id={nameId}
            className={cn(
              "block text-base break-words",
              todo.done && "text-muted-foreground line-through",
            )}
          >
            {todo.name}
          </span>
          {todo.dueOn && !todo.done && (
            <span
              className={cn(
                "text-sm tabular-nums",
                overdue ? "font-medium text-destructive" : "text-muted-foreground",
              )}
            >
              {dueLabel(todo.dueOn, today)}
            </span>
          )}
        </span>
        {todo.notes && (
          <span title="Has notes" className="shrink-0 text-muted-foreground">
            <NoteIcon className="size-5" aria-hidden />
            <span className="sr-only">Has notes</span>
          </span>
        )}
      </button>
    </li>
  );
}
