import { ArrowsClockwiseIcon } from "@phosphor-icons/react";
import { useId } from "react";

import { UserAvatar } from "@/components/user-avatar.tsx";
import { Checkbox } from "@/components/ui/checkbox";
import { daysBetween, dueLabel, pastDateLabel } from "@/lib/dates.ts";
import { cn } from "@/lib/utils";

import { repeatLabel } from "../chore-dates.ts";
import type { Chore } from "../chores.api.ts";

/**
 * One chore: tick the circle to mark it done, tap the rest to see and change it.
 * The second line says when it's due, or for a done chore who did it.
 */
export function ChoreRow({
  chore,
  today,
  viewerId,
  onComplete,
  onUndo,
  onOpen,
}: {
  chore: Chore;
  today: string;
  viewerId: string;
  onComplete: () => void;
  onUndo: () => void;
  onOpen: () => void;
}) {
  const nameId = useId();
  const overdue = !chore.done && chore.dueOn !== null && daysBetween(today, chore.dueOn) < 0;
  const doneBy = chore.lastCompletion?.completedBy;

  return (
    <li className="flex min-h-14 items-stretch">
      <span className="flex items-center py-3 pr-1 pl-4">
        <Checkbox
          aria-labelledby={nameId}
          checked={chore.done}
          onCheckedChange={(checked) => (checked ? onComplete() : onUndo())}
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
              chore.done && "text-muted-foreground line-through",
            )}
          >
            {chore.name}
          </span>
          <span className="flex flex-wrap items-center gap-x-2 text-sm text-muted-foreground">
            {chore.done && chore.lastCompletion ? (
              <span>
                Done {doneBy && `by ${doneBy.id === viewerId ? "you" : doneBy.name}`}{" "}
                {pastDateLabel(chore.lastCompletion.completedOn, today)}
              </span>
            ) : (
              chore.dueOn && (
                <span className={cn("tabular-nums", overdue && "font-medium text-destructive")}>
                  {dueLabel(chore.dueOn, today)}
                </span>
              )
            )}
            {chore.repeat && (
              <span className="inline-flex items-center gap-1">
                <ArrowsClockwiseIcon className="size-3.5" aria-hidden />
                {repeatLabel(chore.repeat)}
              </span>
            )}
          </span>
        </span>
        {chore.assignee && (
          <span title={`Assigned to ${chore.assignee.name}`} className="shrink-0">
            <UserAvatar name={chore.assignee.name} image={chore.assignee.image} size="sm" />
            <span className="sr-only">Assigned to {chore.assignee.name}</span>
          </span>
        )}
      </button>
    </li>
  );
}
