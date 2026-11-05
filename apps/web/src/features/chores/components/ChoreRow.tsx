import { useId } from "react";

import { ArrowsClockwiseIcon } from "@/components/icons.ts";
import { UserAvatar } from "@/components/UserAvatar.tsx";
import { Checkbox } from "@/components/ui/checkbox";
import { daysBetween, dueLabel, pastDateLabel } from "@/lib/dates.ts";
import { cn } from "cn";

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
  settling = false,
  onComplete,
  onUndo,
  onOpen,
}: {
  chore: Chore;
  today: string;
  viewerId: string;
  /** Just ticked or unticked here, and held in place for a moment (lib/use-settling-items.ts) */
  settling?: boolean;
  onComplete: () => void;
  onUndo: () => void;
  onOpen: () => void;
}) {
  const nameId = useId();
  const overdue = !chore.done && chore.dueOn !== null && daysBetween(today, chore.dueOn) < 0;
  const doneBy = chore.lastCompletion?.completedBy;

  return (
    <li
      data-settling={settling ? (chore.done ? "checked" : "open") : undefined}
      className="flex min-h-15 items-stretch overflow-hidden"
    >
      <span className="flex items-center py-3 pr-1 pl-4">
        <Checkbox
          aria-labelledby={nameId}
          checked={chore.done}
          onCheckedChange={(checked) => (checked ? onComplete() : onUndo())}
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
            <span className="tick-label" data-done={chore.done || undefined}>
              {chore.name}
            </span>
          </span>
          <span className="mt-0.5 flex flex-wrap items-center gap-x-2.5 text-[0.8125rem] text-muted-foreground">
            {chore.done && chore.lastCompletion ? (
              <span>
                Done {doneBy && `by ${doneBy.id === viewerId ? "you" : doneBy.name}`}{" "}
                {pastDateLabel(chore.lastCompletion.completedOn, today)}
              </span>
            ) : (
              chore.dueOn && (
                <span
                  className={cn(
                    "tabular-nums",
                    overdue &&
                      "-ml-0.5 rounded-full bg-destructive/10 px-1.5 font-semibold text-destructive",
                  )}
                >
                  {dueLabel(chore.dueOn, today)}
                </span>
              )
            )}
            {chore.repeat && (
              <span className="inline-flex items-center gap-1">
                <ArrowsClockwiseIcon className="size-3.5" weight="bold" aria-hidden />
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
