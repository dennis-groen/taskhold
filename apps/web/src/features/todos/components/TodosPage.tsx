import { useNavigate } from "@tanstack/react-router";
import { useState } from "react";

import { CheckCircleIcon, LockIcon, NotePencilIcon } from "@/components/icons.ts";
import { AreaHeader, Count } from "@/components/layout/AreaHeader.tsx";
import { EmptyState } from "@/components/layout/EmptyState.tsx";
import { DUE_GROUPS, dueGroup, today as todayOnDevice } from "@/lib/dates.ts";
import { notifyAction } from "@/lib/feedback.ts";
import { useSettlingItems } from "@/lib/use-settling-items.ts";
import { cn } from "cn";

import { TodoRow } from "./TodoRow.tsx";
import { TodoSheet } from "./TodoSheet.tsx";
import { useTodos } from "../todos.hooks.ts";
import type { Todo } from "../todos.api.ts";

/**
 * The viewer's private to-dos, grouped by when they're due. Square ticks and the "Only you" pill
 * say nobody else sees them. Adding happens in the dock's field.
 */
export function TodosPage() {
  const { todos, save, setDone, remove, clearDone, moveToChores } = useTodos();
  const [openId, setOpenId] = useState<string | null>(null);
  const navigate = useNavigate();
  const today = todayOnDevice();

  const { settling, touched, listRef } = useSettlingItems();
  // Just-ticked to-dos stay among the open ones for a moment, so a slip can be untapped in place
  const open = todos.filter((todo) => !todo.done || settling.has(todo.id));
  const done = todos.filter((todo) => todo.done && !settling.has(todo.id));
  const overdue = todos.filter(
    (todo) => !todo.done && dueGroup(todo.dueOn, today) === "overdue",
  ).length;

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
      <AreaHeader
        title="To-dos"
        right={
          <span className="inline-flex h-8 items-center gap-1.5 rounded-full bg-white pr-3 pl-[9px] text-[0.8125rem] font-[650] whitespace-nowrap text-[#18191c] dark:bg-background dark:text-foreground">
            <LockIcon aria-hidden weight="bold" className="size-4" />
            Only you
          </span>
        }
        meta={
          <>
            <Count value={todos.filter((todo) => !todo.done).length}>open</Count>
            {overdue > 0 && <Count value={overdue}>overdue</Count>}
            <Count value={todos.length - todos.filter((todo) => !todo.done).length}>done</Count>
          </>
        }
      />

      {open.length === 0 && (
        <EmptyState className="mt-6" icon={done.length > 0 ? CheckCircleIcon : NotePencilIcon}>
          {done.length > 0
            ? "Nothing left to do."
            : "Nothing here yet. Jot down something you need to do, like Renew passport."}
        </EmptyState>
      )}

      <div ref={listRef} className="-mx-4 pt-1 sm:-mx-6 lg:mx-0">
        {DUE_GROUPS.map(({ group, label }) => {
          const inGroup = open.filter((todo) => dueGroup(todo.dueOn, today) === group);
          if (inGroup.length === 0) return null;
          return (
            <section key={group} aria-label={label} data-settle-group className="overflow-hidden">
              <h2 className="flex items-baseline justify-between px-5 pt-4 pb-1">
                <span
                  className={cn("text-sm font-[750]", group === "overdue" && "text-destructive")}
                >
                  {label}
                </span>
                <span className="text-[0.8125rem] font-semibold text-muted-foreground tabular-nums">
                  {inGroup.length}
                </span>
              </h2>
              <ul>{inGroup.map(row)}</ul>
            </section>
          );
        })}
      </div>

      {done.length > 0 && (
        <section aria-labelledby="todos-done" className="-mx-4 mt-2 sm:-mx-6 lg:mx-0">
          <h2 id="todos-done" className="flex items-center justify-between px-5 pt-4 pb-1">
            <span className="text-sm font-[750]">Done</span>
            <button
              type="button"
              onClick={clearDone}
              className="-my-3 -mr-2 min-h-11 rounded-lg px-2 text-sm font-[750] text-area-fg outline-none focus-visible:ring-3 focus-visible:ring-ring/80 active:opacity-60"
            >
              Clear done
            </button>
          </h2>
          <ul>{done.map(row)}</ul>
          <p className="px-5 pt-2 text-[0.8125rem] text-muted-foreground">
            Clearing deletes them for good, after a moment to undo.
          </p>
        </section>
      )}

      <TodoSheet
        todo={todos.find((todo) => todo.id === openId) ?? null}
        today={today}
        onSave={(changes) => save(openId ?? "", changes)}
        onDelete={() => openId && remove(openId)}
        onDone={(todo) => {
          touched(todo.id);
          setDone(todo.id, !todo.done);
        }}
        onMove={(todo) => {
          moveToChores(todo.id);
          notifyAction(
            "Moved to Chores",
            { label: "View", onClick: () => void navigate({ to: "/chores" }) },
            todo.notes
              ? `${todo.name} is shared with everyone now. Its notes were deleted.`
              : `${todo.name} is shared with everyone now.`,
          );
        }}
        onClose={() => setOpenId(null)}
      />
    </>
  );
}
