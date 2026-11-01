import { CaretRightIcon, PlusIcon } from "@phosphor-icons/react";
import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

import { Group, GroupHeading } from "@/components/layout/group.tsx";
import { PageHeading } from "@/components/layout/page-heading.tsx";
import { SharedWithLine } from "@/components/shared-with-line.tsx";
import { Button } from "@/components/ui/button";
import { DUE_GROUPS, dueGroup, dueLabel, today as todayOnDevice } from "@/lib/dates.ts";
import { changeFailed, offerUndo } from "@/lib/feedback.ts";
import { cn } from "@/lib/utils";

import { clearDoneChores, type Chore } from "../chores.api.ts";
import { choreKeys } from "../chores.queries.ts";
import type { Member } from "../components/chore-form.tsx";
import { ChoreRow } from "../components/chore-row.tsx";
import { ChoreSheet } from "../components/chore-sheet.tsx";
import { NewChoreDrawer } from "../components/new-chore-drawer.tsx";
import { useChores } from "../hooks/use-chores.ts";

type Filter = "all" | "mine" | "unassigned";

const FILTERS: { filter: Filter; label: string }[] = [
  { filter: "all", label: "All" },
  { filter: "mine", label: "Mine" },
  { filter: "unassigned", label: "Anyone" },
];

/** The household's chores, grouped by when they're due */
export function ChoresPage({
  viewer,
  members,
  otherMembers,
}: {
  viewer: { id: string; name: string };
  members: Member[];
  otherMembers: string[];
}) {
  const { chores, complete, undo } = useChores(viewer);
  const queryClient = useQueryClient();
  const [filter, setFilter] = useState<Filter>("all");
  const [openId, setOpenId] = useState<string | null>(null);
  const [doneOpen, setDoneOpen] = useState(false);
  const today = todayOnDevice();

  const shown = chores.filter((chore) => {
    if (filter === "mine") return chore.assignee?.id === viewer.id;
    if (filter === "unassigned") return chore.assignee === null;
    return true;
  });
  const open = shown.filter((chore) => !chore.done);
  const done = shown.filter((chore) => chore.done);

  function markDone(chore: Chore) {
    const after = complete(chore);
    offerUndo(
      after.repeat && after.dueOn
        ? `${chore.name} done. ${dueLabel(after.dueOn, today)}.`
        : `${chore.name} done.`,
      () => undo(chore.id),
    );
  }

  async function clearDone() {
    try {
      await clearDoneChores();
      await queryClient.invalidateQueries({ queryKey: choreKeys.list() });
    } catch (err) {
      changeFailed(err, "Couldn't clear done chores. Try again.");
    }
  }

  const rowProps = (chore: Chore) => ({
    chore,
    today,
    viewerId: viewer.id,
    onComplete: () => markDone(chore),
    onUndo: () => undo(chore.id),
    onOpen: () => setOpenId(chore.id),
  });

  return (
    <>
      <PageHeading title="Chores">
        <SharedWithLine otherMembers={otherMembers} />
      </PageHeading>

      {members.length > 1 && (
        <fieldset className="mt-4 flex flex-wrap gap-2">
          <legend className="sr-only">Show</legend>
          {FILTERS.map((option) => (
            <Button
              key={option.filter}
              variant={filter === option.filter ? "default" : "outline"}
              aria-pressed={filter === option.filter}
              onClick={() => setFilter(option.filter)}
              className="h-10 rounded-full px-4"
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
              className="flex min-h-13 w-full items-center gap-3 px-4 text-left text-base text-primary outline-none hover:bg-muted/50 focus-visible:bg-muted/50"
            >
              <PlusIcon className="size-5 shrink-0" weight="bold" aria-hidden />
              Add chore
            </button>
          }
        />
      </Group>

      {open.length === 0 && (
        <p className="px-4 py-10 text-center text-sm text-muted-foreground">
          {emptyMessage(filter, chores.length > 0)}
        </p>
      )}

      {DUE_GROUPS.map(({ group, label }) => {
        const inGroup = open.filter((chore) => dueGroup(chore.dueOn, today) === group);
        if (inGroup.length === 0) return null;
        return (
          <section key={group} aria-label={label}>
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

      {done.length > 0 && (
        <section className="mt-6" aria-label="Done">
          <div className="flex items-center justify-between gap-2">
            <Button
              variant="ghost"
              aria-expanded={doneOpen}
              onClick={() => setDoneOpen((isOpen) => !isOpen)}
              className="-ml-2 h-11 px-2 text-muted-foreground"
            >
              <CaretRightIcon className={cn("transition-transform", doneOpen && "rotate-90")} />
              Done ({done.length})
            </Button>
            <Button variant="outline" className="h-11 px-5" onClick={() => void clearDone()}>
              Clear done
            </Button>
          </div>
          {doneOpen && (
            <Group className="mt-2">
              <ul className="divide-y">
                {done.map((chore) => (
                  <ChoreRow key={chore.id} {...rowProps(chore)} />
                ))}
              </ul>
            </Group>
          )}
        </section>
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
