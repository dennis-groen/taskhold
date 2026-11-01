// Data access for private to-dos: the only place that queries the todo table.
// Every query is scoped to the owner, so someone else's to-do id reads as missing.
import { and, asc, eq, isNotNull, sql } from "drizzle-orm";

import { db, type Executor } from "../../db/client.ts";
import type { Todo } from "./todos.types.ts";
import { todo } from "./todos.schema.ts";

export type TodoRecord = Pick<Todo, "id" | "name" | "notes" | "dueOn" | "doneAt" | "createdAt">;
export type TodoChanges = Partial<
  Pick<typeof todo.$inferInsert, "name" | "notes" | "dueOn" | "doneAt">
>;

const fields = {
  id: todo.id,
  name: todo.name,
  notes: todo.notes,
  dueOn: todo.dueOn,
  doneAt: todo.doneAt,
  createdAt: todo.createdAt,
};

const ownedBy = (ref: { userId: string; todoId: string }) =>
  and(eq(todo.id, ref.todoId), eq(todo.userId, ref.userId));

/** Soonest due first, then oldest first; to-dos without a due date last */
export function findTodos(userId: string, executor: Executor = db): Promise<TodoRecord[]> {
  return executor
    .select(fields)
    .from(todo)
    .where(eq(todo.userId, userId))
    .orderBy(sql`${todo.dueOn} asc nulls last`, asc(todo.createdAt), asc(todo.id));
}

export async function findTodo(
  ref: { userId: string; todoId: string },
  executor: Executor = db,
): Promise<TodoRecord | null> {
  const rows = await executor.select(fields).from(todo).where(ownedBy(ref)).limit(1);
  return rows[0] ?? null;
}

/** Returns false when a to-do with that id already exists, e.g. a retried request */
export async function insertTodo(
  values: {
    id?: typeof todo.$inferInsert.id;
    userId: typeof todo.$inferInsert.userId;
    name: typeof todo.$inferInsert.name;
    notes: typeof todo.$inferInsert.notes;
    dueOn: typeof todo.$inferInsert.dueOn;
  },
  executor: Executor = db,
): Promise<boolean> {
  const rows = await executor
    .insert(todo)
    .values(values)
    .onConflictDoNothing({ target: todo.id })
    .returning({ id: todo.id });
  return rows.length > 0;
}

/** Returns false when the user has no to-do with that id */
export async function updateTodo(
  ref: { userId: string; todoId: string },
  changes: TodoChanges,
  executor: Executor = db,
): Promise<boolean> {
  const rows = await executor
    .update(todo)
    .set(changes)
    .where(ownedBy(ref))
    .returning({ id: todo.id });
  return rows.length > 0;
}

/** Returns the deleted to-do, or null when the user had no to-do with that id */
export async function deleteTodo(
  ref: { userId: string; todoId: string },
  executor: Executor = db,
): Promise<TodoRecord | null> {
  const rows = await executor.delete(todo).where(ownedBy(ref)).returning(fields);
  return rows[0] ?? null;
}

/** Returns how many to-dos were removed */
export async function deleteDoneTodos(userId: string, executor: Executor = db): Promise<number> {
  const rows = await executor
    .delete(todo)
    .where(and(eq(todo.userId, userId), isNotNull(todo.doneAt)))
    .returning({ id: todo.id });
  return rows.length;
}
