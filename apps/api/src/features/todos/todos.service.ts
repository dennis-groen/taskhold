// Business rules for private to-dos. A to-do belongs to one person and only they can see or change
// it; someone else's to-do looks the same as one that doesn't exist. To-dos don't depend on a
// household, except for moving one to the household's chores.
import { announce } from "../live/live-changes.ts";
import { annotate } from "../../lib/wide-event.ts";
import * as choresService from "../chores/chores.service.ts";
import type { ChoreDetail } from "../chores/chores.schema.ts";
import * as todosRepo from "./todos.repo.ts";
import { todoIdTaken, todoLimitReached, todoNotFound } from "./todos.errors.ts";
import type { CreateTodoInput, Todo, UpdateTodoInput } from "./todos.schema.ts";

// Far above what a person uses; it keeps one account from filling the shared database
const MAX_TODOS = 500;

// Names and notes are private, so the wide event only ever gets ids and counts

export async function getTodos(userId: string): Promise<Todo[]> {
  const records = await todosRepo.findTodos(userId);
  annotate("todos", { count: records.length });
  return records.map(toTodo);
}

/**
 * For reminders: names of the person's to-dos that aren't done and are due on or before `today`,
 * split into due today and overdue. To-dos are private to the person, so these are only ever
 * sent to their own devices.
 */
export async function findDueTodos(
  userId: string,
  today: Temporal.PlainDate,
): Promise<{ today: string[]; overdue: string[] }> {
  const due = { today: [] as string[], overdue: [] as string[] };
  for (const { name, dueOn } of await todosRepo.findDueTodos(userId, today)) {
    if (!dueOn) continue;
    (Temporal.PlainDate.compare(dueOn, today) === 0 ? due.today : due.overdue).push(name);
  }
  return due;
}

export async function createTodo(userId: string, input: CreateTodoInput): Promise<Todo> {
  const id = input.id ?? crypto.randomUUID();
  annotate("todos", { todo_id: id });
  // A retry of an add that already got in must still succeed, so only a new to-do counts
  const isNew = !(await todosRepo.findTodo({ userId, todoId: id }));
  if (isNew && (await todosRepo.countTodos(userId)) >= MAX_TODOS) throw todoLimitReached();
  const inserted = await todosRepo.insertTodo({
    id,
    userId,
    name: input.name,
    notes: input.notes ?? null,
    dueOn: input.dueOn ?? null,
  });

  // Not inserted: either a retry of an add that already went through, or someone else's id
  const record = await todosRepo.findTodo({ userId, todoId: id });
  if (!record) throw inserted ? todoNotFound() : todoIdTaken();
  if (inserted) await changed(userId);
  return toTodo(record);
}

export async function updateTodo(
  userId: string,
  todoId: string,
  changes: UpdateTodoInput,
): Promise<Todo> {
  annotate("todos", { todo_id: todoId });
  const ref = { userId, todoId };
  const updated = await todosRepo.updateTodo(ref, {
    name: changes.name,
    notes: changes.notes,
    dueOn: changes.dueOn,
    ...(changes.done !== undefined && {
      doneAt: changes.done ? Temporal.Now.instant() : null,
    }),
  });
  if (!updated) throw todoNotFound();
  await changed(userId);

  const record = await todosRepo.findTodo(ref);
  if (!record) throw todoNotFound();
  return toTodo(record);
}

/** Deleting a to-do that's already gone succeeds, so a retried delete doesn't fail */
export async function deleteTodo(userId: string, todoId: string): Promise<void> {
  annotate("todos", { todo_id: todoId });
  await todosRepo.deleteTodo({ userId, todoId });
  await changed(userId);
}

/** Removes every done to-do. Returns how many went. */
export async function clearDoneTodos(userId: string): Promise<number> {
  const removed = await todosRepo.deleteDoneTodos(userId);
  annotate("todos", { removed_count: removed });
  if (removed > 0) await changed(userId);
  return removed;
}

/**
 * Turns a private to-do into a one-off chore for the user's household, with the same name and due
 * date and nobody assigned, and removes the to-do. Notes stay private, so they don't go along.
 */
export async function moveToChores(userId: string, todoId: string): Promise<ChoreDetail> {
  annotate("todos", { todo_id: todoId });
  // One write, so a failure (e.g. the chore limit) puts the to-do back
  return choresService.writeChores(userId, async (scope) => {
    // Deleting first locks the row, so moving the same to-do twice at once makes one chore
    const removed = await todosRepo.deleteTodo({ userId, todoId }, scope.tx);
    if (!removed) throw todoNotFound();
    // Sent when the write commits; the new chore is announced to the household by the write
    await announce({ userId, topic: "todos" }, scope.tx);
    return choresService.createChoreIn(scope, {
      name: removed.name.slice(0, 60),
      repeat: null,
      dueOn: removed.dueOn,
      assigneeId: null,
    });
  });
}

/** Tells the person's other devices that their to-dos changed. Nobody else hears about it. */
function changed(userId: string) {
  return announce({ userId, topic: "todos" });
}

function toTodo(record: todosRepo.TodoRecord): Todo {
  return { ...record, done: record.doneAt !== null };
}
