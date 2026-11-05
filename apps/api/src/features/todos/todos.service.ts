// Business rules for private to-dos. A to-do belongs to one person and only they can see or change
// it; someone else's to-do looks the same as one that doesn't exist. To-dos don't depend on a
// household, except for moving one to the household's chores.
import { transaction } from "../../db/db.ts";
import { announce } from "../../lib/live-changes.ts";
import { annotate } from "../../lib/wide-event.ts";
import * as choresService from "../chores/chores.service.ts";
import type { ChoreDetail } from "../chores/chores.schema.ts";
import * as todosRepo from "./todos.repo.ts";
import { todoIdTaken, todoNotFound } from "./todos.errors.ts";
import type { CreateTodoInput, Todo, UpdateTodoInput } from "./todos.schema.ts";

// Names and notes are private, so the wide event only ever gets ids and counts

export async function getTodos(userId: string): Promise<Todo[]> {
  const records = await todosRepo.findTodos(userId);
  annotate("todos", { count: records.length });
  return records.map(toTodo);
}

export async function createTodo(userId: string, input: CreateTodoInput): Promise<Todo> {
  const id = input.id ?? crypto.randomUUID();
  annotate("todos", { todo_id: id });
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
  return transaction(async (tx) => {
    // Deleting first locks the row, so moving the same to-do twice at once makes one chore
    const removed = await todosRepo.deleteTodo({ userId, todoId }, tx);
    if (!removed) throw todoNotFound();
    // Sent when the transaction commits; createChore announces the new chore itself
    await announce({ userId, topic: "todos" }, tx);
    // If this fails (e.g. not in a household), throwing rolls the delete back
    return choresService.createChore(userId, {
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
