import { useId } from "react";

import { CalendarBlankIcon } from "@/components/icons.ts";
import { Checkbox } from "@/components/ui/checkbox";
import { daysBetween, rowDueLabel } from "@/lib/dates.ts";
import { cn } from "cn";

import type { Todo } from "../todos.api.ts";

/**
 * One to-do: the square box on the right ticks it off (square, as it's yours alone); tapping the
 * rest opens it. The first line of its notes shows under the name.
 */
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
  const detailId = useId();
  const overdue = !todo.done && todo.dueOn !== null && daysBetween(today, todo.dueOn) < 0;
  const note = todo.notes?.split("\n").find((line) => line.trim() !== "");
  // Today's say nothing: their group says it
  const due = todo.dueOn !== null && !todo.done ? rowDueLabel(todo.dueOn, today) : null;
  const showDue = due !== null;
  const oneLine = !note && !showDue;

  return (
    <li
      data-settling={settling ? (todo.done ? "checked" : "open") : undefined}
      className={cn(
        "relative flex gap-1 pr-[11px] pl-5 ticks-left:flex-row-reverse ticks-left:pr-5 ticks-left:pl-[11px] before:absolute before:top-0 before:right-0 before:left-5 before:h-px before:bg-border first:before:hidden",
        oneLine ? "min-h-14 items-center" : "items-start",
      )}
    >
      <button
        type="button"
        onClick={onOpen}
        aria-haspopup="dialog"
        className={cn(
          "min-w-0 flex-1 self-stretch rounded-lg text-left outline-none transition-opacity duration-150 focus-visible:ring-3 focus-visible:ring-ring/80 focus-visible:ring-inset active:opacity-60",
          oneLine ? "py-2" : "py-3",
        )}
      >
        <span id={nameId} className="block truncate text-[1.0625rem] font-[550]">
          <span className="tick-label" data-done={todo.done || undefined}>
            {todo.name}
          </span>
        </span>
        <span id={detailId}>
          {note && (
            <span className="mt-0.5 block truncate text-sm text-muted-foreground">{note}</span>
          )}
          {showDue && (
            <span
              className={cn(
                "mt-[3px] inline-flex items-center gap-[5px] text-[0.8125rem] font-[650] tabular-nums",
                overdue ? "text-destructive" : "text-muted-foreground",
              )}
            >
              <CalendarBlankIcon aria-hidden weight="bold" className="size-3.5" />
              {due}
            </span>
          )}
        </span>
      </button>
      <span className={cn("grid size-11 shrink-0 place-items-center", !oneLine && "mt-1")}>
        <Checkbox
          aria-labelledby={nameId}
          aria-describedby={oneLine ? undefined : detailId}
          checked={todo.done}
          onCheckedChange={(checked) => onDone(checked)}
          variant="square"
        />
      </span>
    </li>
  );
}
