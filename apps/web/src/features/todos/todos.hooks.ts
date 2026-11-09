import { useSuspenseQuery } from "@tanstack/react-query";
import { useChange } from "@/lib/offline-changes.ts";

import type { TodoInput } from "./todos.api.ts";
import { todoChanges } from "./todos.changes.ts";
import { todosQuery } from "./todos.queries.ts";

/**
 * The viewer's private to-dos, plus every change to them. Changes show on screen straight away
 * and are rolled back if the API rejects them (see todos.changes.ts).
 */
export function useTodos() {
  const { data: todos } = useSuspenseQuery(todosQuery());
  const add = useChange(todoChanges.add);
  const update = useChange(todoChanges.update);
  const edit = useChange(todoChanges.edit);
  const remove = useChange(todoChanges.remove);
  const clearDone = useChange(todoChanges.clearDone);

  return {
    todos,
    add: (input: TodoInput) => add.run({ ...input, id: crypto.randomUUID() }),
    /** Resolves once saved, for forms that close afterwards; rejects when saving failed */
    save: (id: string, changes: Partial<TodoInput>) => edit.runAsync({ id, ...changes }),
    setDone: (id: string, done: boolean) => update.run({ id, done }),
    remove: (id: string) => {
      const todo = todos.find((candidate) => candidate.id === id);
      if (!todo) return;
      remove.run(id, { message: `${todo.name} deleted` });
    },
    clearDone: () => {
      const count = todos.filter((todo) => todo.done).length;
      if (count === 0) return;
      clearDone.run(null, {
        message: count === 1 ? "1 to-do cleared" : `${count} to-dos cleared`,
      });
    },
  };
}
