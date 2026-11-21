import { useState } from "react";

import { ConfirmDialog } from "@/components/ConfirmDialog.tsx";
import { CheckCircleIcon, PlusIcon, UserCircleDashedIcon } from "@/components/icons.ts";
import { AreaHeader, Count, Segments } from "@/components/layout/AreaHeader.tsx";
import { EmptyState } from "@/components/layout/EmptyState.tsx";
import {
  dueGroup,
  rowDueLabel,
  shortDate,
  today as todayOnDevice,
  type DueGroup,
} from "@/lib/dates.ts";
import { useSettlingItems } from "@/lib/use-settling-items.ts";
import { cn } from "cn";

import { repeatLabel } from "../chore-dates.ts";
import type { Chore } from "../chores.api.ts";
import { useChores, useManageChores } from "../chores.hooks.ts";
import type { Member } from "./ChoreForm.tsx";
import { ChoreRow } from "./ChoreRow.tsx";
import { ChoreSheet } from "./ChoreSheet.tsx";

type Filter = "all" | "mine";

/** Chores look a week ahead less than to-dos do: what isn't late or today is just upcoming */
const CHORE_GROUPS: { label: string; groups: DueGroup[] }[] = [
  { label: "Overdue", groups: ["overdue"] },
  { label: "Today", groups: ["today"] },
  { label: "Upcoming", groups: ["week", "later"] },
  { label: "No date", groups: ["anytime"] },
];

/** What most households share, offered while there are no chores yet */
const STARTERS = [
  { name: "Take out the bins", repeat: { every: 1, unit: "week" as const } },
  { name: "Clean the bathroom", repeat: { every: 1, unit: "week" as const } },
  { name: "Hoover", repeat: { every: 1, unit: "week" as const } },
  { name: "Water the plants", repeat: { every: 3, unit: "day" as const } },
  { name: "Change the sheets", repeat: { every: 2, unit: "week" as const } },
  { name: "Feed the cat", repeat: { every: 1, unit: "day" as const } },
];

/**
 * The household's chores, grouped by when they're due. The slab counts what's late and what's due
 * today; the ring on the right of each row marks it done. Adding happens in the dock's field.
 */
export function ChoresPage({
  viewer,
  members,
}: {
  viewer: { id: string; name: string };
  members: Member[];
}) {
  const { chores, complete, undo } = useChores(viewer);
  const { add, clearDone } = useManageChores(members);
  const [filter, setFilter] = useState<Filter>("all");
  const [openId, setOpenId] = useState<string | null>(null);
  const today = todayOnDevice();
  const { settling, touched, listRef } = useSettlingItems();
  // How each just-ticked chore looked when it was ticked, shown done in its old place for a
  // moment. A repeating chore is never "done" in the data: ticking it moves its due date on, so
  // without this it would jump straight to another group and the tick would never be seen.
  const [ticked, setTicked] = useState<ReadonlyMap<string, Chore>>(() => new Map());

  const onScreen = chores.map((chore) =>
    settling.has(chore.id) ? (ticked.get(chore.id) ?? chore) : chore,
  );
  const shown = onScreen.filter((chore) => filter === "all" || chore.assignee?.id === viewer.id);
  const open = shown.filter((chore) => !chore.done || settling.has(chore.id));
  const done = shown.filter((chore) => chore.done && !settling.has(chore.id));

  /** `asDone` is the chore as just ticked off; null lets go of a held one */
  function hold(chore: Chore, asDone: Chore | null) {
    setTicked((current) => {
      const next = new Map(current);
      if (asDone) next.set(chore.id, asDone);
      else next.delete(chore.id);
      return next;
    });
    touched(chore.id);
  }

  function markDone(chore: Chore) {
    const after = complete(chore, (marked) => ({
      message: `${chore.name} is done`,
      detail: marked.repeat && marked.dueOn ? nextDue(marked.dueOn, today) : undefined,
      onUndo: () => hold(chore, null),
    }));
    // Its old place and due date, but done, with this completion ("Done by you today")
    hold(chore, { ...chore, done: true, lastCompletion: after.lastCompletion });
  }

  const due = chores.filter((chore) => !chore.done);
  const overdue = due.filter((chore) => dueGroup(chore.dueOn, today) === "overdue").length;
  const dueToday = due.filter((chore) => dueGroup(chore.dueOn, today) === "today").length;
  const mine = due.filter((chore) => chore.assignee?.id === viewer.id).length;

  const rowProps = (chore: Chore) => ({
    chore,
    // Held after a tick here: the chore as it is now says when it's next due
    justDone:
      settling.has(chore.id) && ticked.has(chore.id)
        ? {
            dueOn: chore.repeat ? (chores.find((now) => now.id === chore.id)?.dueOn ?? null) : null,
          }
        : undefined,
    today,
    viewerId: viewer.id,
    onComplete: () => markDone(chore),
    settling: settling.has(chore.id),
    onUndo: () => {
      hold(chore, null);
      undo(chore.id);
    },
    onOpen: () => setOpenId(chore.id),
  });

  return (
    <>
      <AreaHeader
        title="Chores"
        right={
          members.length > 1 && (
            <Segments
              label="Show"
              value={filter}
              onChange={setFilter}
              options={[
                { value: "all", label: "All" },
                { value: "mine", label: "Mine", count: mine },
              ]}
            />
          )
        }
        meta={
          <>
            {chores.length === 0 ? (
              <>
                <Count value={0}>chores</Count>
                <span>Nothing due</span>
              </>
            ) : (
              <>
                {overdue > 0 && <Count value={overdue}>overdue</Count>}
                <Count value={dueToday}>today</Count>
                <Count value={due.length - overdue - dueToday}>upcoming</Count>
              </>
            )}
          </>
        }
      />

      {chores.length === 0 ? (
        <Starters onPick={(starter) => add({ ...starter, dueOn: today, assigneeId: null })} />
      ) : (
        open.length === 0 && (
          <EmptyState className="mt-6" icon={CheckCircleIcon}>
            {filter === "mine" ? "Nothing assigned to you right now." : "Nothing to do right now."}
          </EmptyState>
        )
      )}

      <div ref={listRef} className="-mx-4 pt-1 sm:-mx-6 lg:mx-0">
        {CHORE_GROUPS.map(({ label, groups }) => {
          const inGroup = open.filter((chore) => groups.includes(dueGroup(chore.dueOn, today)));
          if (inGroup.length === 0) return null;
          const left = inGroup.filter((chore) => !settling.has(chore.id)).length;
          return (
            <section key={label} aria-label={label} data-settle-group className="overflow-hidden">
              <h2 className="flex items-baseline justify-between px-5 pt-4 pb-1">
                <span
                  className={cn("text-sm font-[750]", label === "Overdue" && "text-destructive")}
                >
                  {label}
                </span>
                <span className="text-[0.8125rem] font-semibold text-muted-foreground tabular-nums">
                  {label === "Today" ? (left === 0 ? "All done" : `${left} left`) : inGroup.length}
                </span>
              </h2>
              <ul>
                {inGroup.map((chore) => (
                  <ChoreRow
                    key={chore.id}
                    soon={label === "Upcoming" || label === "No date"}
                    {...rowProps(chore)}
                  />
                ))}
              </ul>
            </section>
          );
        })}
      </div>

      {done.length > 0 && (
        <section aria-labelledby="chores-done" className="-mx-4 mt-2 sm:-mx-6 lg:mx-0">
          <h2 id="chores-done" className="flex items-center justify-between px-5 pt-4 pb-1">
            <span className="text-sm font-[750]">Done</span>
            {/* Unlike your own to-dos this can't be undone, and it goes for everyone: ask first */}
            <ConfirmDialog
              trigger={
                <button
                  type="button"
                  className="-my-3 -mr-2 min-h-11 rounded-lg px-2 text-sm font-[750] text-area-fg outline-none focus-visible:ring-3 focus-visible:ring-ring/80 active:opacity-60"
                >
                  Clear done
                </button>
              }
              title="Clear done chores?"
              description="Done one-off chores are removed for everyone in the household. Repeating chores stay."
              confirmLabel="Clear done"
              onConfirm={async () => clearDone()}
            />
          </h2>
          <ul>
            {done.map((chore) => (
              <ChoreRow key={chore.id} {...rowProps(chore)} />
            ))}
          </ul>
        </section>
      )}

      <ChoreSheet
        chore={chores.find((chore) => chore.id === openId) ?? null}
        members={members}
        viewer={viewer}
        today={today}
        onComplete={markDone}
        onUndo={undo}
        onClose={() => setOpenId(null)}
      />
    </>
  );
}

/** "Next due tomorrow, Fri 20 Nov" */
function nextDue(dueOn: string, today: string): string {
  const when = rowDueLabel(dueOn, today);
  return when && when !== shortDate(dueOn)
    ? `Next due ${when.toLowerCase()}, ${shortDate(dueOn)}`
    : `Next due ${shortDate(dueOn)}`;
}

/** No chores yet: one tap shares a common one, due today and for anyone */
function Starters({ onPick }: { onPick: (starter: (typeof STARTERS)[number]) => void }) {
  return (
    <section aria-labelledby="chore-starters" className="mt-6">
      <h2 id="chore-starters" className="text-[1.375rem] font-[800] tracking-[-0.01em]">
        Share the first chore
      </h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Tap one to add it for anyone, or type your own in the field below.
      </p>
      <ul className="mt-3 -mx-4 sm:-mx-6 lg:mx-0">
        {STARTERS.map((starter, index) => (
          <li key={starter.name} className="relative">
            {index > 0 && (
              <span aria-hidden className="absolute inset-x-0 top-0 ml-[3.75rem] h-px bg-border" />
            )}
            <button
              type="button"
              onClick={() => onPick(starter)}
              className="group/starter flex w-full items-center gap-3 py-2.5 pr-4 pl-5 text-left outline-none transition-colors duration-150 focus-visible:bg-muted/60 focus-visible:ring-2 focus-visible:ring-ring/80 focus-visible:ring-inset active:bg-muted/70 lg:rounded-2xl"
            >
              <UserCircleDashedIcon aria-hidden className="size-7 shrink-0 text-line-strong" />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[1.0625rem] font-semibold">
                  {starter.name}
                </span>
                <span className="block text-sm text-muted-foreground">
                  {repeatLabel(starter.repeat)}
                </span>
              </span>
              <span
                aria-hidden
                className="grid size-10 shrink-0 place-items-center rounded-[12px] bg-area-tint text-area-fg transition-transform duration-150 ease-(--ease-out) group-active/starter:scale-[0.92] motion-reduce:group-active/starter:scale-100"
              >
                <PlusIcon weight="bold" className="size-5" />
              </span>
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
