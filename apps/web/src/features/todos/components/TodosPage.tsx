import { useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";

import { AddRow } from "@/components/AddRow.tsx";
import { CheckCircleIcon, LockIcon, NotePencilIcon } from "@/components/icons.ts";
import { CollapsibleGroup } from "@/components/layout/CollapsibleGroup.tsx";
import { EmptyState } from "@/components/layout/EmptyState.tsx";
import { Group, GroupHeading } from "@/components/layout/Group.tsx";
import { PageHeading } from "@/components/layout/PageHeading.tsx";
import { Button } from "@/components/ui/button";
import { DUE_GROUPS, dueGroup, today as todayOnDevice } from "@/lib/dates.ts";
import { useSettlingItems } from "@/lib/use-settling-items.ts";
import { cn } from "cn";

import { TodoRow } from "./TodoRow.tsx";
import { TodoSheet } from "./TodoSheet.tsx";
import { useTodos } from "../todos.hooks.ts";
import type { Todo } from "../todos.api.ts";

/** The viewer's private to-dos, grouped by when they're due */
export function TodosPage() {
  const { todos, add, save, setDone, remove, clearDone } = useTodos();
  const [openId, setOpenId] = useState<string | null>(null);
  const navigate = useNavigate();
  const today = todayOnDevice();

  const { settling, touched, listRef } = useSettlingItems();
  // Just-ticked to-dos stay among the open ones for a moment, so a slip can be untapped in place
  const open = todos.filter((todo) => !todo.done || settling.has(todo.id));
  const done = todos.filter((todo) => todo.done && !settling.has(todo.id));

  const row = (todo: Todo) => (
    <TodoRow
      key={todo.id}
      todo={todo}
      today={today}
      settling={settling.has(todo.id)}
      onDone={(isDone) => {
        touched(todo.id);
        setDone(todo.id, isDone);
      }}
      onOpen={() => setOpenId(todo.id)}
    />
  );

  return (
    <>
      <PageHeading title="Personal">
        <span className="inline-flex items-center gap-1.5">
          <LockIcon className="size-4" weight="bold" aria-hidden />
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

      {open.length === 0 && (
        <EmptyState icon={done.length > 0 ? CheckCircleIcon : NotePencilIcon}>
          {done.length > 0
            ? "Nothing left to do."
            : "Nothing here yet. Add something you need to do, like Renew passport."}
        </EmptyState>
      )}

      <div ref={listRef}>
        {DUE_GROUPS.map(({ group, label }) => {
          const inGroup = open.filter((todo) => dueGroup(todo.dueOn, today) === group);
          if (inGroup.length === 0) return null;
          return (
            <section key={group} aria-label={label} data-settle-group>
              <GroupHeading className={cn(group === "overdue" && "text-destructive")}>
                {label}
              </GroupHeading>
              <Group>
                <ul className="divide-y">{inGroup.map(row)}</ul>
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
            <Button variant="outline" size="lg" onClick={clearDone}>
              Clear done
            </Button>
          }
        >
          <ul className="divide-y">{done.map(row)}</ul>
        </CollapsibleGroup>
      )}

      <TodoSheet
        todo={todos.find((todo) => todo.id === openId) ?? null}
        onSave={(changes) => save(openId ?? "", changes)}
        onDelete={() => openId && remove(openId)}
        onMoved={(name) =>
          toast(`${name} is now a household chore`, {
            action: { label: "View", onClick: () => void navigate({ to: "/chores" }) },
          })
        }
        onClose={() => setOpenId(null)}
      />
    </>
  );
}
