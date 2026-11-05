import { BroomIcon, CheckCircleIcon, PlusIcon } from "@phosphor-icons/react";
import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

import { ConfirmDialog } from "@/components/ConfirmDialog.tsx";
import { CollapsibleGroup } from "@/components/layout/CollapsibleGroup.tsx";
import { EmptyState } from "@/components/layout/EmptyState.tsx";
import { Group, GroupHeading } from "@/components/layout/Group.tsx";
import { PageHeading } from "@/components/layout/PageHeading.tsx";
import { SharedWithLine } from "@/components/SharedWithLine.tsx";
import type { Housemate } from "@/lib/shared-with.ts";
import { Button } from "@/components/ui/button";
import { DUE_GROUPS, dueGroup, dueLabel, today as todayOnDevice } from "@/lib/dates.ts";
import { offerUndo } from "@/lib/feedback.ts";
import { useSettlingItems } from "@/lib/use-settling-items.ts";
import { cn } from "cn";

import { clearDoneChores, type Chore } from "../chores.api.ts";
import { choreKeys } from "../chores.queries.ts";
import type { Member } from "./ChoreForm.tsx";
import { ChoreRow } from "./ChoreRow.tsx";
import { ChoreSheet } from "./ChoreSheet.tsx";
import { NewChoreDrawer } from "./NewChoreDrawer.tsx";
import { useChores } from "../chores.hooks.ts";

type Filter = "all" | "mine" | "unassigned";

const FILTERS: { filter: Filter; label: string }[] = [
  { filter: "all", label: "All" },
  { filter: "mine", label: "Mine" },
  { filter: "unassigned", label: "Up for grabs" },
];

/** The household's chores, grouped by when they're due */
export function ChoresPage({
  viewer,
  members,
  otherMembers,
}: {
  viewer: { id: string; name: string };
  members: Member[];
  otherMembers: Housemate[];
}) {
  const { chores, complete, undo } = useChores(viewer);
  const queryClient = useQueryClient();
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
  const shown = onScreen.filter((chore) => {
    if (filter === "mine") return chore.assignee?.id === viewer.id;
    if (filter === "unassigned") return chore.assignee === null;
    return true;
  });
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
    const after = complete(chore);
    // Its old place and due date, but done, with this completion ("Done by you today")
    hold(chore, { ...chore, done: true, lastCompletion: after.lastCompletion });
    offerUndo(
      after.repeat && after.dueOn
        ? `${chore.name} done. ${dueLabel(after.dueOn, today)}.`
        : `${chore.name} done.`,
      () => {
        hold(chore, null);
        undo(chore.id);
      },
    );
  }

  // Errors stay in the confirm dialog, so people can retry or cancel
  async function clearDone() {
    await clearDoneChores();
    await queryClient.invalidateQueries({ queryKey: choreKeys.list() });
  }

  const rowProps = (chore: Chore) => ({
    chore,
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
      <PageHeading title="Chores">
        <SharedWithLine otherMembers={otherMembers} />
      </PageHeading>

      {members.length > 1 && (
        <fieldset className="mt-5 flex flex-wrap gap-2">
          <legend className="sr-only">Show</legend>
          {FILTERS.map((option) => (
            <Button
              key={option.filter}
              variant="chip"
              aria-pressed={filter === option.filter}
              onClick={() => setFilter(option.filter)}
            >
              {option.label}
            </Button>
          ))}
        </fieldset>
      )}

      <Group className="mt-4">
        <NewChoreDrawer
          members={members}
          viewerId={viewer.id}
          trigger={
            <button
              type="button"
              className="group/add flex min-h-14 w-full items-center gap-3 px-4 text-left text-base font-medium text-primary-soft-foreground outline-none transition-colors hover:bg-primary-soft/35 focus-visible:bg-primary-soft/35 focus-visible:ring-2 focus-visible:ring-ring/80 focus-visible:ring-inset active:bg-primary-soft/50"
            >
              <span
                aria-hidden
                className="flex size-6 shrink-0 items-center justify-center rounded-full bg-primary-soft transition-transform duration-200 ease-out group-hover/add:rotate-90 group-focus-visible/add:rotate-90 motion-reduce:transition-none"
              >
                <PlusIcon className="size-3.5" weight="bold" />
              </span>
              Add chore
            </button>
          }
        />
      </Group>

      {open.length === 0 && (
        <EmptyState icon={chores.length > 0 ? CheckCircleIcon : BroomIcon}>
          {emptyMessage(filter, chores.length > 0)}
        </EmptyState>
      )}

      <div ref={listRef}>
        {DUE_GROUPS.map(({ group, label }) => {
          const inGroup = open.filter((chore) => dueGroup(chore.dueOn, today) === group);
          if (inGroup.length === 0) return null;
          return (
            <section key={group} aria-label={label} data-settle-group>
              <GroupHeading className={cn(group === "overdue" && "text-destructive")}>
                {label}
              </GroupHeading>
              <Group>
                <ul className="divide-y">
                  {inGroup.map((chore) => (
                    <ChoreRow key={chore.id} {...rowProps(chore)} />
                  ))}
                </ul>
              </Group>
            </section>
          );
        })}
      </div>

      {done.length > 0 && (
        <CollapsibleGroup
          label="Done"
          count={done.length}
          action={
            // Unlike your own to-dos this can't be undone, and it goes for everyone: ask first
            <ConfirmDialog
              trigger={
                <Button variant="outline" size="lg">
                  Clear done
                </Button>
              }
              title="Clear done chores?"
              description="Done one-off chores are removed for everyone in the household. Repeating chores stay."
              confirmLabel="Clear done"
              onConfirm={clearDone}
            />
          }
        >
          <ul className="divide-y">
            {done.map((chore) => (
              <ChoreRow key={chore.id} {...rowProps(chore)} />
            ))}
          </ul>
        </CollapsibleGroup>
      )}

      <ChoreSheet
        chore={chores.find((chore) => chore.id === openId) ?? null}
        members={members}
        viewerId={viewer.id}
        today={today}
        onUndo={undo}
        onClose={() => setOpenId(null)}
      />
    </>
  );
}

function emptyMessage(filter: Filter, anyChores: boolean): string {
  if (!anyChores) return "No chores yet. Add the first one, like Take out the bins.";
  if (filter === "mine") return "Nothing assigned to you right now.";
  if (filter === "unassigned") return "Every chore has someone assigned.";
  return "Nothing to do right now.";
}
