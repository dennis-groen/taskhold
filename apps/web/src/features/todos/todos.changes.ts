// Every change to the viewer's to-dos (see lib/offline-changes.ts). Everything a change needs
// travels in its variables, which are saved with it on the device; their shape is part of what a
// phone may still have waiting, so change it only with care.
import { defineChange } from "@/lib/offline-changes.ts";

import {
  clearDoneTodos,
  createTodo,
  deleteTodo,
  updateTodo,
  type Todo,
  type TodoInput,
} from "./todos.api.ts";
import { todosQuery } from "./todos.queries.ts";

export type TodoChanges = Partial<TodoInput> & { id: string; done?: boolean };

const theTodos = () => todosQuery().queryKey;

const update = {
  idempotent: true,
  send: ({ id, ...changes }: TodoChanges) => updateTodo(id, changes),
  target: theTodos,
  apply: (list: Todo[], { id, ...changes }: TodoChanges) =>
    list.map((todo) =>
      todo.id === id
        ? {
            ...todo,
            ...changes,
            ...(changes.done !== undefined && {
              doneAt: changes.done ? Temporal.Now.instant().toString() : null,
            }),
          }
        : todo,
    ),
};

// Brings deleted to-dos back as they were, with the same ids
const restore = defineChange("todos", "restore", {
  idempotent: true,
  ordered: true,
  send: async (removed: Todo[]) => {
    for (const { id, name, notes, dueOn, done } of removed) {
      await createTodo({ id, name, notes, dueOn });
      if (done) await updateTodo(id, { done });
    }
  },
  target: theTodos,
  apply: (list, removed) => [...list, ...removed],
});

export const todoChanges = {
  // The id comes from the app, so the API ignores a second copy
  add: defineChange("todos", "add", {
    idempotent: true,
    send: (input: TodoInput & { id: string }) => createTodo(input),
    target: theTodos,
    apply: (list, input) => [
      ...list,
      { ...input, done: false, doneAt: null, createdAt: Temporal.Now.instant().toString() },
    ],
  }),

  update: defineChange("todos", "update", update),
  // Edits come from a form that shows its own error
  edit: defineChange("todos", "edit", { ...update, failure: false }),

  // A second delete fails, as the to-do is gone
  remove: defineChange("todos", "remove", {
    idempotent: false,
    ordered: true,
    send: (id: string) => deleteTodo(id),
    target: theTodos,
    apply: (list, id) => list.filter((todo) => todo.id !== id),
    undo: {
      by: restore,
      vars: (id, before) => {
        const todo = before?.find((candidate) => candidate.id === id);
        return todo ? [todo] : null;
      },
    },
  }),

  clearDone: defineChange("todos", "clear-done", {
    idempotent: true,
    ordered: true,
    send: (_vars: null) => clearDoneTodos(),
    target: theTodos,
    apply: (list) => list.filter((todo) => !todo.done),
    undo: {
      by: restore,
      vars: (_vars, before) => {
        const done = before?.filter((todo) => todo.done) ?? [];
        return done.length > 0 ? done : null;
      },
    },
  }),

  restore,
};
