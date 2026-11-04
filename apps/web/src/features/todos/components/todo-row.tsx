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
  settling = false,
  onDone,
  onOpen,
}: {
  todo: Todo;
  today: string;
  /** Just ticked or unticked here, and held in place for a moment (lib/use-settling-items.ts) */
  settling?: boolean;
  onDone: (done: boolean) => void;
  onOpen: () => void;
}) {
  const nameId = useId();
  const overdue = !todo.done && todo.dueOn !== null && daysBetween(today, todo.dueOn) < 0;

  return (
    <li
      data-settling={settling ? (todo.done ? "checked" : "open") : undefined}
      className="flex min-h-14 items-stretch overflow-hidden"
    >
      <span className="flex items-center py-3 pr-1 pl-4">
        <Checkbox
          aria-labelledby={nameId}
          checked={todo.done}
          onCheckedChange={(checked) => onDone(checked)}
          variant="tick"
        />
      </span>
      <button
        type="button"
        onClick={onOpen}
        className="flex min-w-0 flex-1 items-center gap-3 py-3 pr-4 pl-2 text-left outline-none transition-colors hover:bg-muted/40 focus-visible:bg-muted/60 focus-visible:ring-2 focus-visible:ring-ring/80 focus-visible:ring-inset active:bg-muted/70"
      >
        <span className="min-w-0 flex-1">
          <span id={nameId} className="block text-base break-words">
            <span className="tick-label" data-done={todo.done || undefined}>
              {todo.name}
            </span>
          </span>
          {todo.dueOn && !todo.done && (
            <span
              className={cn(
                "mt-0.5 inline-block text-[0.8125rem] tabular-nums",
                overdue
                  ? "-ml-0.5 rounded-full bg-destructive/10 px-1.5 font-semibold text-destructive"
                  : "text-muted-foreground",
              )}
            >
              {dueLabel(todo.dueOn, today)}
            </span>
          )}
        </span>
        {todo.notes && (
          <span title="Has notes" className="shrink-0 text-muted-foreground/80">
            <NoteIcon className="size-5" aria-hidden />
            <span className="sr-only">Has notes</span>
          </span>
        )}
      </button>
    </li>
  );
}
