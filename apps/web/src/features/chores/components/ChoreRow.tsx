import { useId, type ReactNode } from "react";

import { RepeatIcon } from "@/components/icons.ts";
import { MemberMark } from "@/components/MemberMark.tsx";
import { UserAvatar } from "@/components/UserAvatar.tsx";
import { Checkbox } from "@/components/ui/checkbox";
import { firstName } from "@/lib/shared-with.ts";
import { daysBetween, pastDateLabel, rowDueLabel } from "@/lib/dates.ts";
import { cn } from "cn";

import { repeatLabel } from "../chore-dates.ts";
import type { Chore } from "../chores.api.ts";

/**
 * One chore: whose it is on the left, the ring on the right marks it done, and tapping the rest
 * opens it. The second line says when it's due, or for a done chore who did it.
 */
export function ChoreRow({
  chore,
  today,
  viewerId,
  soon = false,
  settling = false,
  justDone,
  onComplete,
  onUndo,
  onOpen,
}: {
  chore: Chore;
  today: string;
  viewerId: string;
  /** Not due yet: the ring is quieter, so today's and late chores stand out */
  soon?: boolean;
  /** Just ticked or unticked here, and held in place for a moment (lib/use-settling-items.ts) */
  settling?: boolean;
  /** Marked done here a moment ago: the row says so, and when it's due next */
  justDone?: { dueOn: string | null };
  onComplete: () => void;
  onUndo: () => void;
  onOpen: () => void;
}) {
  const nameId = useId();
  const subId = useId();
  const overdue = !chore.done && chore.dueOn !== null && daysBetween(today, chore.dueOn) < 0;
  const doneBy = chore.lastCompletion?.completedBy;

  const sub: ReactNode[] = [];
  const due = chore.dueOn && !chore.done ? rowDueLabel(chore.dueOn, today) : null;
  if (justDone) {
    // Ticked here a moment ago: who did it, and when it comes round again
    sub.push(
      <span key="done" className="truncate font-[650] text-area-fg">
        Done by you
        {justDone.dueOn &&
          ` · next due ${midSentence(rowDueLabel(justDone.dueOn, today) ?? "today")}`}
      </span>,
    );
  } else if (chore.done && chore.lastCompletion) {
    sub.push(
      <span key="done" className="truncate">
        Done {doneBy && `by ${doneBy.id === viewerId ? "you" : firstName(doneBy.name)}`}{" "}
        {pastDateLabel(chore.lastCompletion.completedOn, today)}
      </span>,
    );
  } else if (due) {
    sub.push(
      <span key="due" className={cn("tabular-nums", overdue && "font-[650] text-destructive")}>
        {due}
      </span>,
    );
  }
  // A just-done row's line is only about what just happened
  if (!justDone && !chore.done && !chore.assignee) sub.push(<span key="anyone">Anyone</span>);
  if (!justDone && !chore.done && !chore.repeat) sub.push(<span key="once">Once</span>);
  if (!justDone && chore.repeat) {
    sub.push(
      <span key="repeat" className="inline-flex items-center gap-1">
        <RepeatIcon aria-hidden weight="bold" className="size-[15px]" />
        {repeatLabel(chore.repeat)}
      </span>,
    );
  }

  return (
    <li
      data-settling={settling ? (chore.done ? "checked" : "open") : undefined}
      className="relative flex min-h-16 items-center gap-1 pr-4 pl-5 ticks-left:flex-row-reverse ticks-left:pr-5 ticks-left:pl-3 before:absolute before:top-0 before:right-0 before:left-[3.75rem] before:h-px before:bg-border first:before:hidden"
    >
      <button
        type="button"
        onClick={onOpen}
        aria-haspopup="dialog"
        className="flex min-w-0 flex-1 items-center gap-3 self-stretch rounded-lg py-2 text-left outline-none transition-opacity duration-150 focus-visible:ring-3 focus-visible:ring-ring/80 focus-visible:ring-inset active:opacity-60"
      >
        {chore.assignee ? (
          <UserAvatar
            name={chore.assignee.name}
            image={chore.assignee.image}
            size="sm"
            className="data-[size=sm]:size-7"
          />
        ) : (
          <span
            aria-hidden
            className="size-7 shrink-0 rounded-full border-[1.5px] border-dashed border-line-strong"
          />
        )}
        <span className="min-w-0 flex-1">
          <span id={nameId} className="block truncate text-[1.0625rem] font-semibold">
            <span className="tick-label" data-done={chore.done || undefined}>
              {chore.name}
            </span>
          </span>
          {sub.length > 0 && (
            <span
              id={subId}
              className="mt-[3px] flex items-center gap-1.5 overflow-hidden text-sm whitespace-nowrap text-muted-foreground"
            >
              {sub.flatMap((part, index) =>
                index === 0
                  ? [part]
                  : [
                      <span
                        key={`sep-${index}`}
                        aria-hidden
                        className="size-[3px] shrink-0 rounded-full bg-current opacity-60"
                      />,
                      part,
                    ],
              )}
            </span>
          )}
        </span>
        {chore.assignee && <span className="sr-only">Assigned to {chore.assignee.name}</span>}
      </button>
      <span className="relative grid size-11 shrink-0 place-items-center">
        <Checkbox
          aria-label={`Mark ${chore.name} done`}
          aria-describedby={sub.length > 0 ? subId : undefined}
          checked={chore.done || Boolean(justDone)}
          onCheckedChange={(checked) => (checked ? onComplete() : onUndo())}
          variant="done"
          className={cn(soon && "border-[1.5px] border-area-fg/70 text-area-fg/70")}
        />
        {chore.done && doneBy && <MemberMark name={doneBy.name} className="bottom-px left-px" />}
      </span>
    </li>
  );
}

/** "Tomorrow" becomes "tomorrow" inside a sentence; a date like "Sat 5 Dec" keeps its capitals */
function midSentence(label: string): string {
  return /^(Today|Tomorrow|Yesterday)$/.test(label) ? label.toLowerCase() : label;
}
