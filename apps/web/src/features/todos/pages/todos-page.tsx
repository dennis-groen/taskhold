import { CaretRightIcon, LockIcon } from "@phosphor-icons/react";
import { useState } from "react";

import { AddRow } from "@/components/add-row.tsx";
import { Group, GroupHeading } from "@/components/layout/group.tsx";
import { PageHeading } from "@/components/layout/page-heading.tsx";
import { Button } from "@/components/ui/button";
import { DUE_GROUPS, dueGroup, today as todayOnDevice } from "@/lib/dates.ts";
import { cn } from "@/lib/utils";

import { TodoRow } from "../components/todo-row.tsx";
import { TodoSheet } from "../components/todo-sheet.tsx";
import { useTodos } from "../hooks/use-todos.ts";
import type { Todo } from "../todos.api.ts";

/** The viewer's private to-dos, grouped by when they're due */
export function TodosPage() {
  const { todos, add, save, setDone, remove, clearDone } = useTodos();
  const [openId, setOpenId] = useState<string | null>(null);
  const [doneOpen, setDoneOpen] = useState(false);
  const [moved, setMoved] = useState<string | null>(null);
  const today = todayOnDevice();

  const open = todos.filter((todo) => !todo.done);
  const done = todos.filter((todo) => todo.done);

  const row = (todo: Todo) => (
    <TodoRow
      key={todo.id}
      todo={todo}
      today={today}
      onDone={(isDone) => setDone(todo.id, isDone)}
      onOpen={() => setOpenId(todo.id)}
    />
  );

  return (
    <>
      <PageHeading title="Personal">
        <span className="inline-flex items-center gap-1.5">
          <LockIcon className="size-4" aria-hidden />
          Only you can see this
        </span>
      </PageHeading>

      <Group className="mt-6">
        <AddRow
          label="Add to-do"
          maxLength={100}
          onAdd={(name) => add({ name, notes: null, dueOn: null })}
        />
      </Group>

      <div aria-live="polite">
        {moved && (
          <p className="mt-3 px-1 text-sm text-muted-foreground">
            Moved {moved} to the household's chores.
          </p>
        )}
      </div>

      {open.length === 0 && (
        <p className="px-4 py-10 text-center text-sm text-muted-foreground">
          {done.length > 0
            ? "Nothing left to do."
            : "Nothing here yet. Add something you need to do, like Renew passport."}
        </p>
      )}

      {DUE_GROUPS.map(({ group, label }) => {
        const inGroup = open.filter((todo) => dueGroup(todo.dueOn, today) === group);
        if (inGroup.length === 0) return null;
        return (
          <section key={group} aria-label={label}>
            <GroupHeading className={cn(group === "overdue" && "text-destructive")}>
              {label}
            </GroupHeading>
            <Group>
              <ul className="divide-y">{inGroup.map(row)}</ul>
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
            <Button variant="outline" className="h-11 px-5" onClick={clearDone}>
              Clear done
            </Button>
          </div>
          {doneOpen && (
            <Group className="mt-2">
              <ul className="divide-y">{done.map(row)}</ul>
            </Group>
          )}
        </section>
      )}

      <TodoSheet
        todo={todos.find((todo) => todo.id === openId) ?? null}
        onSave={(changes) => save(openId ?? "", changes)}
        onDelete={() => openId && remove(openId)}
        onMoved={setMoved}
        onClose={() => setOpenId(null)}
      />
    </>
  );
}
